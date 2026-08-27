/**
 * The case-ops action-taking agent — the DEMO'S DEFINING PIECE, and the
 * WORKSHOP'S main graded surface.
 *
 * Built on `@openai/agents` (OpenAI Agents SDK) pointed at Databricks'
 * Responses API. Tools capture `db` + `userEmail` via closure so every
 * action is attributed to the viewing user (OBO).
 *
 * ════════════════════════════════════════════════════════════════════════
 * WHAT SHIPS WORKING vs WHAT THE TRAINEE BUILDS  (see APP_WORKSHOP.md)
 * ════════════════════════════════════════════════════════════════════════
 * SHIPS WORKING:
 *   - The full agent loop (Responses API wiring, streaming, MLflow spans).
 *   - `ask_data` — the investigation tool. Config-driven MAS-OR-Genie:
 *     uses the MAS endpoint if `masEndpointName` is set, else the Genie
 *     space if `genieSpaceId` is set. This is the trainee's Build-1 choice
 *     (they wire ONE backend); the app registers whichever is configured.
 *
 * TRAINEE BUILDS (stubbed here — they THROW "not implemented" so the app
 * still compiles + boots, and the model knows the tools exist):
 *   - `find_flag`         → Build 2 (Assist): read the live shortfall
 *   - `rank_dispositions`    → Build 2 (Assist): read the ML recommendation
 *   - `execute_case_action`→ Build 3 (Act):   the human-in-the-loop write
 *
 * The three-phase chain (Discover → Draft+confirm → Execute) is described in
 * the instructions below so the model attempts it — but Phases 2/3 depend on
 * the stubbed tools, which is the point: the trainee implements them and the
 * chain lights up. Until then, the model can still investigate via ask_data.
 *
 * KEEP `configureAgentsSdk()` as-is — it handles the Databricks Responses API
 * wiring, the `Connection: close` stale-socket workaround, and the 64-char
 * `input[*].id` strip.
 */
import type { Request } from 'express';
import OpenAI from 'openai';
import {
  Agent,
  run,
  setDefaultOpenAIClient,
  setTracingDisabled,
} from '@openai/agents';
import type { Tool } from '@openai/agents';
import { loggedTool as tool } from './tools/logged-tool.js';
import * as mlflow from 'mlflow-tracing';
import { z } from 'zod';
import { authHeaders } from '../lib/auth.js';
import type { AppDb } from '../db/index.js';
// The Lakebase read helpers the Assist tools wire up — the synced read-only
// mirrors (open_queue, payment_position, disposition_recommendations).
import {
  getOpenFlag,
  worstFlag,
  getPayment,
  getRecommendation,
} from '../db/queries/cases.js';
import type { OpenFlag } from '../db/queries/cases.js';
// The data-backend helpers. Both are config-driven and share the same
// DataCallResult shape + ToolProgressEvent stream, so the `ask_data` tool
// below can delegate to EITHER without the UI caring which powers it. This
// preserves the template's MAS-OR-Genie flexibility exactly.
import { callMasEndpoint } from './tools/mas.js';
import { callGenieSpace } from './tools/genie.js';
export type { ToolProgressEvent } from './tools/types.js';

/** Captured detail of the last failing call to the model serving endpoint. */
export type ModelErrorDetail = {
  status: number;
  url: string;
  bodyText: string;
  code?: string;
  message?: string;
};

export type AgentContext = {
  db: AppDb;
  userEmail: string;
  req: Request;
  /** MAS serving-endpoint name the `ask_data` tool talks to WHEN SET. Set in
   * `config/app.json` as `masEndpointName` (env `MAS_ENDPOINT_NAME`). Leave
   * empty to use Genie instead. This is the trainee's Build-1 backend choice
   * — the app registers whichever of MAS/Genie is configured. */
  masEndpointName: string;
  /** Genie space id the `ask_data` tool talks to WHEN `masEndpointName` is
   * empty. Set as `genieSpaceId` (env `GENIE_SPACE_ID`). */
  genieSpaceId: string;
  databricksHost: string;
  model: string;
  /** Called by long-running tools to surface progress to the UI. */
  onToolProgress?: (ev: import('./tools/types.js').ToolProgressEvent) => void;
  /** Mutated by the OpenAI fetch shim on any non-2xx. */
  modelError?: { current: ModelErrorDetail | null };
};

// ────────────────────────────────────────────────────────────────────────────
// Adding / editing tools — READ THIS before touching `parameters: z.object(...)`.
//
// The Agents SDK ships every tool's zod schema to the Responses API with
// `strict: true`. Strict mode requires EVERY property in `required`. So use
// `.nullable()`, NOT `.optional()`:
//   ❌  reason: z.string().optional()   // breaks with strict:true (masked 502)
//   ✅  reason: z.string().nullable()   // field required, value may be null
// Every field needs a `.describe(...)`. Keep property names snake_case.
// Use the `loggedTool` wrapper (imported as `tool`), not the raw SDK `tool`.
// ────────────────────────────────────────────────────────────────────────────
function makeTools(ctx: AgentContext): Tool[] {
  // ── ask_data — SHIPS WORKING. Config-driven MAS-OR-Genie. ─────────────────
  // Delegates to the MAS endpoint if one is configured, else the Genie space.
  // Both helpers return {answer, trace_id} and stream progress via
  // ctx.onToolProgress → the Thinking panel. Registered ONLY when a backend
  // is configured (otherwise the tool would 404 confusingly).
  const askData = tool({
    name: 'ask_data',
    description:
      'Investigate the governed lakehouse with a natural-language question — the tool generates SQL / retrieves knowledge and returns a synthesized answer. Use for any "why" / "what happened" / investigative question about store positions, sell-through, shortfalls, or surplus. Prefer ONE narrow, well-formed question over many small ones.',
    parameters: z.object({
      question: z
        .string()
        .describe(
          'A clear, focused English question about the data. Narrow questions finish in 20–40s; broad multi-part questions take longer.',
        ),
    }),
    execute: async ({ question }) =>
      mlflow.withSpan(
        async () =>
          ctx.masEndpointName
            ? callMasEndpoint(ctx, ctx.masEndpointName, question)
            : callGenieSpace(ctx, ctx.genieSpaceId, question),
        {
          name: 'ask_data',
          spanType: mlflow.SpanType.TOOL,
          inputs: { question },
        },
      ),
  });

  // ── find_flag — TRAINEE BUILDS (Build 2 · Assist). ───────────────────
  // READ the live flagged payment + its risk metrics from the open queue.
  // If payment_id is given: read that flag. If null: return the worst
  // (highest exposure) open flag. Enrich with payment details (program, state,
  // amount) from payment_position if available. Return a flat object the model
  // reads: found:true + flag fields, or found:false if nothing exists.
  const findShortfall = tool({
    name: 'find_flag',
    description:
      'Read the live flag for a payment (or the worst open flagged payment) from Lakebase: the fraud/eligibility signals on it, the signal count, risk level, and improper-payment exposure. Read-only.',
    parameters: z.object({
      payment_id: z
        .string()
        .nullable()
        .describe('Payment id, e.g. PAY-0000214. Null → return the worst open flagged payment.'),
    }),
    execute: async ({ payment_id: paymentId }) =>
      mlflow.withSpan(
        async () => {
          // Read the open flag: either for the specified payment or the worst (by exposure).
          const flag: OpenFlag | null = paymentId
            ? await getOpenFlag(ctx.db, paymentId)
            : await worstFlag(ctx.db);

          if (!flag) {
            return { found: false };
          }

          // Enrich with payment details (program, state, amount, recovery exposure).
          const payment = await getPayment(ctx.db, flag.paymentId);

          return {
            found: true,
            payment_id: flag.paymentId,
            program: payment?.program ?? null,
            state: payment?.state ?? null,
            payment_amount_usd: payment?.paymentAmountUsd ?? null,
            n_signals: flag.nSignals,
            signals: flag.signalList,
            risk_level: flag.riskLevel,
            improper_payment_exposure_usd: flag.improperPaymentExposureUsd,
            projected_recovery_if_investigated_usd:
              payment?.projectedRecoveryIfInvestigatedUsd ?? null,
          };
        },
        {
          name: 'find_flag',
          spanType: mlflow.SpanType.TOOL,
          inputs: { payment_id: paymentId },
        },
      ),
  });

  // ── rank_dispositions — TRAINEE BUILDS (Build 2 · Assist). ───────────────
  // READ the ML model's ranked dispositions for a payment from
  // disposition_recommendations. Return the recommended disposition + its
  // predicted recovery/cost, plus the full action_ranking (all three options
  // with their hold hours, cost, recovery $, and net value). This is the demo's
  // "ML in the loop" moment — the agent quotes these ranked options in the
  // draft and does arithmetic what-ifs from the ranking (don't re-call the
  // model). Return found:false if no recommendation exists yet.
  const rankRecoveryMoves = tool({
    name: 'rank_dispositions',
    description:
      "Read the model's ranked dispositions for a payment from Lakebase app.disposition_recommendations: the recommended disposition, its predicted recovery $ + net value, and the full ranking of all three options (release / hold_for_verification / refer_to_investigation) with each option's hold hours, cost, predicted recovery $ and net $. Read-only. Quote these in the draft; do the what-if (recovery vs. citizen-delay cost) arithmetically from the ranking.",
    parameters: z.object({
      payment_id: z.string().describe('Payment id, e.g. PAY-0000214.'),
    }),
    execute: async ({ payment_id: paymentId }) =>
      mlflow.withSpan(
        async () => {
          // Read the disposition recommendation from the ML model's batch predictions.
          const rec = await getRecommendation(ctx.db, paymentId);

          if (!rec) {
            return { found: false };
          }

          return {
            found: true,
            payment_id: rec.paymentId,
            recommended_disposition: rec.recommendedDisposition,
            recommended_hold_hours: rec.recommendedHoldHours,
            predicted_recovery_usd: rec.predictedRecoveryUsd,
            predicted_cost_usd: rec.predictedCostUsd,
            action_ranking: rec.actionRanking,
          };
        },
        {
          name: 'rank_dispositions',
          spanType: mlflow.SpanType.TOOL,
          inputs: { payment_id: paymentId },
        },
      ),
  });

  // ── execute_case_action — TRAINEE BUILDS (Build 3 · Act). ──────────────────
  // THE ONLY WRITE. Record an approved disposition to app.case_actions.
  // ONLY call this AFTER the examiner has explicitly approved. Wraps the INSERT
  // in a transaction so it commits atomically. Creates an audit trail entry
  // (approved by ctx.userEmail, at now, with a short note derived from the
  // action type). Returns the inserted row's id + status + a confirmation message
  // for the user (executive summary).
  const executeRecoveryAction = tool({
    name: 'execute_case_action',
    description:
      "WRITE (requires prior examiner approval): record the approved disposition to Lakebase app.case_actions — action_type (release / hold_for_verification / refer_to_investigation), hold duration, the drafted memo, predicted recovery $ — and append an audit entry. Inputs are a FILTER + the drafted memo text, never a list of ids. Use ONLY after the examiner says yes.",
    parameters: z.object({
      payment_id: z.string().describe('The payment being dispositioned, e.g. PAY-0000214.'),
      action_type: z
        .enum(['release', 'hold_for_verification', 'refer_to_investigation'])
        .describe('The approved disposition.'),
      hold_duration_hours: z
        .number()
        .int()
        .nullable()
        .describe('For a hold: how long to hold the payment (hours), e.g. 48. Null otherwise.'),
      drafted_request: z
        .string()
        .describe('The case memo / investigation referral the agent drafted.'),
      predicted_recovery_usd: z
        .number()
        .describe('Predicted recovery for this disposition (from rank_dispositions).'),
    }),
    execute: async () => {
      // Build 3 (Act) — not yet implemented in this layer. The tool is
      // REGISTERED so the model knows it exists and the Assist chain can draft
      // + STOP for approval; the write lands in the next layer.
      throw new Error(
        'Not implemented — execute_case_action is the Build 3 Act layer.',
      );
    }
  });

  // find_flag / rank_dispositions / execute_case_action are
  // registered so the MODEL knows they exist (and the trainee sees them in
  // the tool list) — they throw until implemented. ask_data is registered
  // only when a backend is configured.
  const tools: Tool[] = [findShortfall, rankRecoveryMoves, executeRecoveryAction];
  if (ctx.masEndpointName || ctx.genieSpaceId) {
    tools.unshift(askData);
  }
  return tools;
}

export async function configureAgentsSdk(ctx: AgentContext): Promise<void> {
  const headers = await authHeaders(ctx.req);
  const bearer = headers.get('Authorization')?.replace(/^Bearer /, '') ?? '';
  // Custom fetch: fresh TCP connection per call (avoids the stale-socket 502
  // after a long ask_data hop) + strip the >64-char `input[*].id` the SDK
  // echoes back on round 2 (Databricks' Responses API rejects long ids and
  // the streaming gateway masks the 400 as a bare 502). See git history.
  const client = new OpenAI({
    apiKey: bearer,
    baseURL: `${ctx.databricksHost}/serving-endpoints`,
    maxRetries: 4,
    fetch: async (input, init) => {
      const headers = new Headers(init?.headers);
      headers.set('Connection', 'close');
      let body = init?.body;
      if (typeof body === 'string' && body.startsWith('{')) {
        try {
          const parsed = JSON.parse(body) as {
            input?: Array<Record<string, unknown>>;
            messages?: Array<Record<string, unknown>>;
          };
          if (Array.isArray(parsed.input)) {
            for (const item of parsed.input) {
              const id = item.id;
              if (typeof id === 'string' && id.length > 64) {
                delete item.id;
              }
            }
          }
          if (Array.isArray(parsed.messages)) {
            for (const m of parsed.messages) {
              const content = (m as { content?: unknown }).content;
              if (Array.isArray(content)) {
                for (const part of content as Array<Record<string, unknown>>) {
                  if (part && typeof part === 'object') {
                    delete part.annotations;
                  }
                }
              }
            }
          }
          body = JSON.stringify(parsed);
        } catch {
          /* not JSON — pass through */
        }
      }
      const url =
        typeof input === 'string'
          ? input
          : (input as URL | Request).toString?.() ?? String(input);
      console.debug(
        `[openai-shim] → ${url}\n  request_body: ${typeof body === 'string' ? body.slice(0, 2000) : '(non-string)'}`,
      );
      const tShim = Date.now();
      let resp: Response;
      try {
        resp = await fetch(input as Parameters<typeof fetch>[0], {
          ...init,
          headers,
          body,
          keepalive: false,
        });
      } catch (e) {
        console.error('[openai-shim] fetch threw', { url, error: e });
        throw e;
      }
      console.debug(
        `[openai-shim] ← ${resp.status} ${resp.statusText} from ${url} in ${Date.now() - tShim}ms (content-type: ${resp.headers.get('content-type') ?? '?'})`,
      );
      if (!resp.ok) {
        try {
          const text = await resp.clone().text();
          let code: string | undefined;
          let message: string | undefined;
          try {
            const parsed = JSON.parse(text) as { error_code?: string; message?: string };
            code = parsed.error_code;
            message = parsed.message;
          } catch {
            /* body wasn't JSON — keep raw text */
          }
          if (ctx.modelError) {
            ctx.modelError.current = {
              status: resp.status,
              url,
              bodyText: text,
              code,
              message,
            };
          }
          console.error(
            `[openai-shim] ${resp.status} from ${url}\n  request_body: ${typeof body === 'string' ? body.slice(0, 4000) : '(non-string)'}\n  response_body: ${text.slice(0, 4000)}`,
          );
        } catch (e) {
          console.error('[openai-shim] failed to clone error response', e);
        }
      }
      return resp;
    },
  });
  setDefaultOpenAIClient(client);
  // Responses API (the SDK's default — we leave setOpenAIAPI alone).
  // Keep `agentModel` on `databricks-gpt-5-4` or a newer Responses-capable
  // GPT (needs `openai/v1/responses`). Claude/non-Responses models 400.
  setTracingDisabled(true); // disable OpenAI's tracing backend; we use MLflow
}

export function buildAgent(ctx: AgentContext): Agent {
  return new Agent({
    name: 'CaseOps',
    model: ctx.model,
    modelSettings: {
      reasoning: { effort: 'low', summary: 'auto' },
      // Databricks' gateway doesn't fully support the Responses server-side
      // state backend; stateless runs work fine.
      store: false,
    },
    instructions: `
You are the case operations assistant for the Director of Program Integrity at
Sentinel Payment Integrity (Priya Raman). Your user is a non-technical executive
staring at a fraud-flag queue all day. Be decisive, concise, and always lead with
the number and the recommended disposition.

The situation: a cross-agency fraud-match feed surfaced improper payments across
the agency's benefits portfolio. ~174 payments are flagged with at least one
fraud/eligibility signal. The hero: Payment PAY-0000214 (Child Care, high risk) is
flagged with duplicate_identity + cross_agency_fraud_flag — improper-payment
exposure ~$1.5K, recommended disposition is hold for 48 hours pending manual
verification. (These figures are illustrative — always quote live tool results.)

════════════════════════════════════════════════════════════
TOOLS AT YOUR DISPOSAL
════════════════════════════════════════════════════════════

ask_data(question) — investigate the governed lakehouse. Use for any WHY /
  WHAT HAPPENED / investigative question (why a payment is flagged, what signals
  triggered it, what is the exposure, who is the recipient). Prefer ONE narrow
  question over many small ones. Narrow questions finish in 20–40s.

find_flag(payment_id) — read the LIVE fraud flag for a payment (or the worst
  open flagged payment if payment_id is null) from Lakebase: the fraud/eligibility
  signals on it, signal count, risk level, improper-payment exposure, and
  projected recovery if investigated. Read-only.

rank_dispositions(payment_id) — read the ML risk model's ranked dispositions for
  a payment from Lakebase: the recommended disposition (release / hold_for_verification /
  refer_to_investigation), its predicted recovery $ + cost, and the FULL ranking
  of all three options with each option's hold hours, cost, recovery $, and net value.
  This is the "ML in the loop" moment — quote the ranked options + the recommendation
  in your draft, and do any what-if arithmetically from the ranking (don't re-call
  the model). Read-only.

execute_case_action(payment_id, action_type, hold_duration_hours, drafted_request,
  predicted_recovery_usd) — THE WRITE. Records the approved disposition to Lakebase
  app.case_actions (action_type + hold duration + the drafted case memo + predicted
  recovery) + an audit trail entry (who, when, action). Use ONLY after the user
  has explicitly approved. Inputs are the payment id + disposition details + the
  drafted memo — never a list of ids.

THERE ARE NO OTHER TOOLS.

════════════════════════════════════════════════════════════
OPERATING MODES
════════════════════════════════════════════════════════════

MODE A — INVESTIGATION
If the user asks "why", "what", "where", "who", or anything that requires
reading data → call ask_data EXACTLY ONCE with a SHORT, targeted question,
then synthesize for the user. Do NOT take an action unless explicitly asked.

MODE B — DISPOSITION ACTION CHAIN (HUMAN-IN-THE-LOOP)
If the user asks you to DISPOSITION / HANDLE / RECOMMEND something, run a
strict three-phase chain with a confirmation step in the middle. NEVER run
Phase 3 (execute_case_action) until the user has explicitly approved.

--- Phase 1 · Discover (read-only) ---
  1. If you don't already know the target payment, call ask_data to understand
     the highest-exposure flagged payment, or ask the user once. For the hero
     flow it's PAY-0000214 (Child Care, duplicate_identity).
  2. Call find_flag(payment_id) to read the live fraud flag + its signals,
     risk level, exposure, and projected recovery.
  3. Call rank_dispositions(payment_id) — THE ML MOMENT. Remember the
     recommended disposition + the full ranking; you quote them in Phase 2.

--- Phase 2 · Draft + confirm (STOP) ---
  4. Present the ranked options (release / hold_for_verification / refer_to_investigation),
     each with hold hours (if applicable), cost, recovery $, and net value.
     Recommend the top one and explain WHY (e.g. "Hold 48 hours on PAY-0000214 —
     duplicate_identity fraud flag, highest net value, lowest citizen-delay cost,
     protects program integrity both ends"). Offer a what-if ("what if 72 hours
     instead of 48?") computed arithmetically from the ranking. Draft a concise
     case memo / investigation referral.
  5. End with: "Reply **approve** to record this disposition — or tell me what to
     change." STOP HERE. Do not proceed until the user's next message.

--- Phase 3 · Execute (on approval) ---
  Triggered only when the user's NEXT message is an approval ("approve", "yes",
  "go", "do it", "execute", "looks good"). A revision request means → redraft
  and go back to Phase 2 (STOP again).
  On approval: call execute_case_action ONCE with the payment id + approved
  disposition + hold hours (if applicable) + the drafted memo + the predicted
  recovery $. Then summarize what was recorded (see SUMMARY FORMAT). Numbers come
  from the tool result, not memory.

If a tool errors, surface the error plainly — never pretend a tool ran.

════════════════════════════════════════════════════════════
SUMMARY FORMAT (final assistant message)
════════════════════════════════════════════════════════════

ALWAYS end an action chain with a markdown summary the executive reads in 10s:

**Done — PAY-0000214 disposition recorded.**

- **Hold 48 hours** · duplicate_identity + cross_agency_fraud_flag
- **Predicted recovery $178** · audit logged for review
- Recorded by Priya Raman, awaiting fulfillment by verification team

Rules: bold the headline stat on line 1; numbers come from tool results, not
memory; close with ONE concrete next step only if warranted.

════════════════════════════════════════════════════════════
TONE
════════════════════════════════════════════════════════════

The user is busy. Lead with the answer + the recommended disposition. No preamble.
When investigating, synthesize — don't dump raw data. Numbers first, rationale second.
`.trim(),
    tools: makeTools(ctx),
  });
}

export { run };
