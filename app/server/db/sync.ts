import { sql } from 'drizzle-orm';
import { getExecutionContext } from '@databricks/appkit';
import type { AppDb } from './index.js';
import {
  paymentPosition,
  openQueue,
  dispositionRecommendations,
} from './schema.js';
import type { ActionOption } from './schema.js';

/**
 * One-shot Delta → Lakebase sync — Sentinel Payment Integrity.
 *
 * > In production this is Lakebase Synced Tables (managed, continuous
 * > Delta→Lakebase replication with the same UC governance). For the demo
 * > build we keep it simple: a manual one-shot sync at boot, code we can
 * > show, no extra resource. Same outcome on screen.
 *
 * Pulls the three READ-ONLY Gold mirrors:
 *   - payment_position         (the flagged payments + flagged count)
 *   - open_queue               (open flag + risk metrics)
 *   - disposition_recommendations (the ML model's ranked dispositions)
 *
 * `case_actions` is the app's own WRITABLE table — never synced, starts empty.
 *
 * The disposition_recommendations table is BUILT BY THE TRAINEE (the ML step of
 * the workshop). So its query is fault-tolerant: if the table doesn't exist
 * yet, we log + leave the mirror empty rather than failing boot.
 *
 * Idempotent in the "only-if-destination-empty" sense — if the position
 * mirror has rows, we skip. Pass `{ forceIfAnyEmpty: true }` to re-sync
 * on demand (used by the "Reset demo" button).
 */

type DataConfig = {
  catalog: string;
  schema: string;
  tables: {
    /** gold_open_queue — one row per payment with risk metrics (payment grain). */
    paymentPosition: string;
    /** gold_open_queue — open flag + risk metrics (payment grain). */
    openQueue: string;
    /** gold_disposition_recommendations — the ML model's ranked dispositions (payment grain).
     *  Built by the trainee; sync tolerates it not existing yet. */
    dispositionRecommendations?: string;
  };
};

export async function syncFromDelta(
  db: AppDb,
  cfg: DataConfig,
  opts: { forceIfAnyEmpty?: boolean } = {},
): Promise<void> {
  const exists = await db.execute(
    sql`SELECT COUNT(*)::int AS n FROM app.payment_position`,
  );
  const n = (exists.rows[0] as { n: number } | undefined)?.n ?? 0;
  if (n > 0 && !opts.forceIfAnyEmpty) return;

  const warehouseId = process.env.DATABRICKS_WAREHOUSE_ID;
  if (!warehouseId) {
    console.warn('[sync] DATABRICKS_WAREHOUSE_ID not set — skipping Delta sync');
    return;
  }

  console.log('[sync] Starting Delta → Lakebase sync (parallel)…');
  const t0 = Date.now();

  const fq = (name: 'paymentPosition' | 'openQueue' | 'dispositionRecommendations') =>
    `${cfg.catalog}.${cfg.schema}.${cfg.tables[name]}`;

  const hasDispositionTable = Boolean(cfg.tables.dispositionRecommendations);

  // Fire the position + queue queries in parallel (the slow part). Both read from
  // gold_open_queue (it's the payment-grained source). The disposition-recommendations
  // query is BEST-EFFORT (the trainee may not have built that Gold table yet),
  // so run it defensively and swallow a TABLE_OR_VIEW_NOT_FOUND into an empty result.
  const [positionRows, queueRows, dispositionRows] = await Promise.all([
    execSql<{
      payment_id: string;
      program: string | null;
      state: string | null;
      payment_amount_usd: number | null;
      queue_date: string | null;
      n_signals: number | null;
      signal_list: string | null;
      risk_level: string | null;
      improper_payment_exposure_usd: number | null;
      projected_recovery_if_investigated_usd: number | null;
    }>(
      warehouseId,
      `SELECT payment_id, program, state, payment_amount_usd, queue_date,
              n_signals, signal_list, risk_level, improper_payment_exposure_usd,
              projected_recovery_if_investigated_usd
       FROM ${fq('paymentPosition')}`,
    ),
    execSql<{
      payment_id: string;
      n_signals: number | null;
      signal_list: string | null;
      risk_level: string | null;
      improper_payment_exposure_usd: number | null;
    }>(
      warehouseId,
      `SELECT payment_id, n_signals, signal_list, risk_level,
              improper_payment_exposure_usd
       FROM ${fq('openQueue')}`,
    ),
    hasDispositionTable
      ? execSql<{
          payment_id: string;
          recommended_disposition: string | null;
          predicted_recovery_usd: number | null;
          disposition_ranking: string | null;
          confidence_score: number | null;
          scored_at: string | null;
        }>(
          warehouseId,
          // The real gold_disposition_recommendations is payment-grained and does
          // NOT carry recommended_hold_hours or predicted_cost_usd as columns —
          // those live INSIDE disposition_ranking (per-option holdHours + cost).
          // We select only the real columns here and DERIVE the two scalar fields
          // from the recommended option after parsing the ranking (below).
          `SELECT payment_id, recommended_disposition,
                  predicted_recovery_usd,
                  disposition_ranking, confidence_score, scored_at
           FROM ${fq('dispositionRecommendations')}`,
        ).catch((e) => {
          // The trainee builds this table in the ML step — until then it
          // won't exist. Degrade gracefully so the app still boots + the
          // Visualize layer works; the agent's rank tool is the trainee's
          // Build-2 task anyway.
          console.warn(
            `[sync] disposition_recommendations not available yet (this is the trainee's ML step) — leaving that mirror empty: ${(e as Error).message}`,
          );
          return [] as never[];
        })
      : Promise.resolve([] as never[]),
  ]);
  console.log(
    `[sync]   queries done (${((Date.now() - t0) / 1000).toFixed(1)}s) — inserting…`,
  );

  if (positionRows.length) {
    await chunkInsert(positionRows, 2_000, (chunk) =>
      db
        .insert(paymentPosition)
        .values(
          chunk.map((r) => ({
            id: r.payment_id,
            paymentId: r.payment_id,
            program: r.program,
            state: r.state,
            paymentAmountUsd: r.payment_amount_usd === null ? null : Number(r.payment_amount_usd),
            queueDate: r.queue_date,
            nSignals: r.n_signals === null ? null : Number(r.n_signals),
            // Join signal_list array into comma-separated text.
            signals:
              r.signal_list && Array.isArray(JSON.parse(r.signal_list))
                ? JSON.parse(r.signal_list).join(', ')
                : r.signal_list,
            riskLevel: r.risk_level,
            improperPaymentExposureUsd:
              r.improper_payment_exposure_usd === null
                ? null
                : Number(r.improper_payment_exposure_usd),
            projectedRecoveryIfInvestigatedUsd:
              r.projected_recovery_if_investigated_usd === null
                ? null
                : Number(r.projected_recovery_if_investigated_usd),
          })),
        )
        .onConflictDoNothing(),
    );
  }
  console.log(
    `[sync]   positions: ${positionRows.length} (${((Date.now() - t0) / 1000).toFixed(1)}s)`,
  );

  if (queueRows.length) {
    await chunkInsert(queueRows, 5_000, (chunk) =>
      db
        .insert(openQueue)
        .values(
          chunk.map((r) => ({
            id: r.payment_id,
            paymentId: r.payment_id,
            nSignals: r.n_signals === null ? null : Number(r.n_signals),
            signalList: r.signal_list,
            riskLevel: r.risk_level,
            improperPaymentExposureUsd:
              r.improper_payment_exposure_usd === null
                ? null
                : Number(r.improper_payment_exposure_usd),
          })),
        )
        .onConflictDoNothing(),
    );
  }
  console.log(
    `[sync]   queue: ${queueRows.length} (${((Date.now() - t0) / 1000).toFixed(1)}s)`,
  );

  if (dispositionRows.length) {
    await chunkInsert(dispositionRows, 5_000, (chunk) =>
      db
        .insert(dispositionRecommendations)
        .values(
          chunk.map((r) => {
            const recommendedDisposition = (r.recommended_disposition === 'release' ||
            r.recommended_disposition === 'hold_for_verification' ||
            r.recommended_disposition === 'refer_to_investigation'
              ? r.recommended_disposition
              : null) as
              | 'release'
              | 'hold_for_verification'
              | 'refer_to_investigation'
              | null;
            // Transform disposition_ranking JSON string → ActionOption[].
            // disposition_ranking is an array of objects with:
            //   { disposition, predicted_recovery_usd, predicted_net_value_usd, citizen_delay_cost, rank }
            // Map to ActionOption:
            //   { disposition, holdHours, costUsd, predictedRecoveryUsd, predictedNetValueUsd }
            const actionRanking = parseDispositionRanking(r.disposition_ranking);
            // recommended_hold_hours + predicted_cost_usd aren't source columns;
            // derive them from the recommended option within the ranking (the
            // per-option holdHours + costUsd that parseDispositionRanking produced).
            const recommendedOption = actionRanking.find(
              (o) => o.disposition === recommendedDisposition,
            );
            return {
              id: r.payment_id,
              paymentId: r.payment_id,
              recommendedDisposition,
              recommendedHoldHours: recommendedOption?.holdHours ?? null,
              predictedRecoveryUsd:
                r.predicted_recovery_usd === null
                  ? null
                  : Number(r.predicted_recovery_usd),
              predictedCostUsd: recommendedOption?.costUsd ?? null,
              actionRanking,
              confidenceScore:
                r.confidence_score === null ? null : Number(r.confidence_score),
              // The SQL Statements API returns timestamps as strings; the
              // Drizzle `timestamp` column wants a Date.
              scoredAt: r.scored_at === null ? null : new Date(r.scored_at),
            };
          }),
        )
        .onConflictDoNothing(),
    );
  }
  console.log(
    `[sync]   disposition recommendations: ${dispositionRows.length} (${((Date.now() - t0) / 1000).toFixed(1)}s)`,
  );

  const dt = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`[sync] Done in ${dt}s`);
}

/** Transform `disposition_ranking` (source JSON string) → ActionOption[].
 *  Source shape: [{ disposition, predicted_recovery_usd, predicted_net_value_usd,
 *  citizen_delay_cost, rank }, ...]
 *  Target shape: [{ disposition, holdHours, costUsd, predictedRecoveryUsd,
 *  predictedNetValueUsd }, ...]
 *  Hold hours defaults: 48 for 'hold_for_verification', 0 otherwise. */
function parseDispositionRanking(raw: string | null): ActionOption[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item: Record<string, unknown>) => {
        const disposition = item.disposition as string;
        if (
          disposition !== 'release' &&
          disposition !== 'hold_for_verification' &&
          disposition !== 'refer_to_investigation'
        ) {
          return null;
        }
        const holdHours =
          disposition === 'hold_for_verification' ? 48 : 0;
        return {
          disposition: disposition as 'release' | 'hold_for_verification' | 'refer_to_investigation',
          holdHours,
          costUsd: Number(item.citizen_delay_cost ?? 0),
          predictedRecoveryUsd: Number(item.predicted_recovery_usd ?? 0),
          predictedNetValueUsd: Number(item.predicted_net_value_usd ?? 0),
        };
      })
      .filter((opt): opt is ActionOption => opt !== null);
  } catch {
    return [];
  }
}

/**
 * Reset: truncate the app's writable table + chat state, then re-sync the
 * read-only mirrors. All agent writes are wiped — flags return to open,
 * exposure returns to full. Intentional: between presentations the backlog
 * should look untouched.
 */
export async function wipeMirroredTables(db: AppDb): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.execute(sql`TRUNCATE TABLE app.feedback RESTART IDENTITY CASCADE`);
    await tx.execute(sql`TRUNCATE TABLE app.messages RESTART IDENTITY CASCADE`);
    await tx.execute(sql`TRUNCATE TABLE app.conversations RESTART IDENTITY CASCADE`);
    // The writable action table — the only place agent writes land.
    await tx.execute(sql`TRUNCATE TABLE app.case_actions RESTART IDENTITY CASCADE`);
    // Read-only mirrors — re-pulled by syncFromDelta after this.
    await tx.execute(sql`TRUNCATE TABLE app.disposition_recommendations RESTART IDENTITY CASCADE`);
    await tx.execute(sql`TRUNCATE TABLE app.open_queue RESTART IDENTITY CASCADE`);
    await tx.execute(sql`TRUNCATE TABLE app.payment_position RESTART IDENTITY CASCADE`);
  });
}

async function execSql<T>(
  warehouseId: string,
  statement: string,
): Promise<T[]> {
  const { client } = getExecutionContext();
  type StmtResp = {
    statement_id: string;
    status: { state: string; error?: { message: string } };
    manifest?: {
      schema: { columns: Array<{ name: string }> };
      chunks?: Array<{ chunk_index: number; row_count: number }>;
    };
    result?: {
      chunk_index: number;
      row_count: number;
      data_array?: Array<Array<unknown>>;
      next_chunk_index?: number;
    };
  };

  const initial = (await client.apiClient.request({
    method: 'POST',
    path: '/api/2.0/sql/statements',
    payload: {
      statement,
      warehouse_id: warehouseId,
      wait_timeout: '50s',
      on_wait_timeout: 'CONTINUE',
      disposition: 'INLINE',
      format: 'JSON_ARRAY',
    },
    headers: new Headers(),
    raw: false,
    query: {},
  })) as StmtResp;

  // Cap total polling at 10 minutes. The warehouse can take a couple of
  // minutes to spin from idle + scan, but a state stuck in RUNNING beyond
  // 10 min is broken — fail loud instead of silently blocking boot forever.
  const POLL_DEADLINE_MS = 10 * 60 * 1000;
  const startedAt = Date.now();

  let cur = initial;
  while (
    cur.status.state !== 'SUCCEEDED' &&
    cur.status.state !== 'FAILED' &&
    cur.status.state !== 'CANCELED'
  ) {
    if (Date.now() - startedAt > POLL_DEADLINE_MS) {
      throw new Error(
        `[sync] SQL still ${cur.status.state} after 10 minutes — aborting (statement_id=${cur.statement_id})`,
      );
    }
    await new Promise((r) => setTimeout(r, 1000));
    cur = (await client.apiClient.request({
      method: 'GET',
      path: `/api/2.0/sql/statements/${cur.statement_id}`,
      headers: new Headers(),
      raw: false,
      query: {},
    })) as StmtResp;
  }
  if (cur.status.state !== 'SUCCEEDED') {
    throw new Error(
      `[sync] SQL failed: ${cur.status.error?.message ?? cur.status.state}`,
    );
  }

  const cols = cur.manifest?.schema.columns.map((c) => c.name) ?? [];
  const rows: T[] = [];
  let chunk = cur.result;
  while (chunk) {
    for (const row of chunk.data_array ?? []) {
      const obj: Record<string, unknown> = {};
      for (let i = 0; i < cols.length; i++) obj[cols[i]] = row[i];
      rows.push(obj as T);
    }
    if (chunk.next_chunk_index === undefined || chunk.next_chunk_index === null) break;
    chunk = (await client.apiClient.request({
      method: 'GET',
      path: `/api/2.0/sql/statements/${cur.statement_id}/result/chunks/${chunk.next_chunk_index}`,
      headers: new Headers(),
      raw: false,
      query: {},
    })) as StmtResp['result'];
  }
  return rows;
}

async function chunkInsert<T>(
  rows: T[],
  size: number,
  fn: (chunk: T[]) => Promise<unknown>,
): Promise<void> {
  for (let i = 0; i < rows.length; i += size) {
    await fn(rows.slice(i, i + size));
  }
}
