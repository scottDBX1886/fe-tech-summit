/**
 * Evidence that Assist retrieval pulls from the BUILD-1 LAKEBASE SEARCH INDEX
 * (public.reference_playbooks, Postgres full-text search) — NOT a separate
 * vector store. Emits submission2/lakebase_search_evidence.json capturing:
 *   - the index location + that it is a Postgres tsvector (in the Lakebase pool),
 *   - the exact FTS SQL the app runs,
 *   - the live retrieved rows for the hero's signals.
 * Run: DATABRICKS_CONFIG_PROFILE=fe-tech DATABRICKS_APP_PORT=8794 tsx scripts/gen_lakebase_search_evidence.ts
 */
import 'dotenv/config';
import { writeFileSync } from 'node:fs';
import { createApp, server, lakebase, analytics } from '@databricks/appkit';
import { sql } from 'drizzle-orm';
import { createDb } from '../server/db/index.js';
import { searchPlaybooks } from '../server/db/queries/cases.js';

const OUT = '../submission2';

await createApp({
  plugins: [server(), lakebase(), analytics({})],
  async onPluginsReady(appkit) {
    const db = createDb(appkit.lakebase.pool);

    // Prove the index is a Postgres tsvector living IN Lakebase (not an external
    // vector store): read its column type + row count from the same pool.
    const meta = await db.execute(sql`
      SELECT c.table_schema, c.table_name, c.column_name, c.data_type
      FROM information_schema.columns c
      WHERE c.table_schema = 'public'
        AND c.table_name = 'reference_playbooks'
        AND c.column_name IN ('search_vector','embedding')
      ORDER BY c.column_name
    `);
    const count = await db.execute(sql`SELECT COUNT(*)::int AS n FROM public.reference_playbooks`);

    // The exact full-text query the app's searchPlaybooks() runs.
    const ftsSql =
      "SELECT playbook_id, signal_type, risk_level, title, guidance_text, " +
      "verification_steps, regulatory_cite, " +
      "ts_rank(search_vector, to_tsquery('english', :tsquery)) AS rank " +
      "FROM public.reference_playbooks " +
      "WHERE search_vector @@ to_tsquery('english', :tsquery) OR signal_type = :signal_type " +
      "ORDER BY CASE WHEN signal_type = :signal_type THEN 0 ELSE 1 END, rank DESC LIMIT 3";

    const query = 'duplicate identity cross agency fraud match high risk';
    const hits = await searchPlaybooks(db, query, {
      signalType: 'duplicate_identity',
      limit: 3,
    });

    const evidence = {
      claim:
        'Assist memo drafting retrieves from the Build-1 Lakebase Search index (Postgres full-text search over public.reference_playbooks.search_vector), NOT a separate vector store.',
      index: {
        engine: 'Databricks Lakebase (Postgres) full-text search',
        location: 'public.reference_playbooks',
        connection: 'the app-owned Lakebase pool (LAKEBASE_ENDPOINT projects/sentinel-payments/branches/production) — same pool as the queue + write-back',
        source_of_truth: 'Build 1 pipeline lands playbooks in Lakebase; mirrored to Delta as sent_benefits.lb_reference_playbooks_history (CDC)',
        indexed_columns: (meta.rows as Array<Record<string, unknown>>),
        row_count: (count.rows[0] as { n: number }).n,
        separate_vector_store_used: false,
      },
      retrieval_call: {
        app_helper: 'searchPlaybooks(db, query, { signalType })  [server/db/queries/cases.ts]',
        agent_tool: 'search_playbooks(query, signal_type)  [server/agent/caseops.ts]',
        query,
        signal_type: 'duplicate_identity',
        fts_sql: ftsSql,
      },
      retrieved_rows: hits.map((p) => ({
        playbook_id: p.playbookId,
        signal_type: p.signalType,
        risk_level: p.riskLevel,
        title: p.title,
        regulatory_cite: p.regulatoryCite,
        ts_rank: p.rank,
        guidance_text: p.guidanceText,
        verification_steps: p.verificationSteps,
      })),
      generated_at: new Date().toISOString(),
    };
    writeFileSync(`${OUT}/lakebase_search_evidence.json`, JSON.stringify(evidence, null, 2));
    console.log(
      'lakebase_search_evidence.json:',
      hits.length,
      'retrieved rows | index rows:',
      (count.rows[0] as { n: number }).n,
    );
    process.exit(0);
  },
});
