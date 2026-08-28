/**
 * All-data-read guardrail (Build 3 · Unity Gateway, technical requirement:
 * "prevent all Lakebase data from being read").
 *
 * WHERE this sits and WHY:
 *   The AI Gateway's own guardrails (PII / safety on the sentinel-unity-gateway
 *   endpoint) only ever see the LLM prompt/response *text* — never the SQL the
 *   agent's tools send to Lakebase. So a gateway guardrail can't actually stop a
 *   runaway "read everything" query; it can only flag prompt wording. This module
 *   is the REAL control: it inspects each Lakebase-touching tool's INPUT before
 *   the query runs and blocks any attempt to pull the whole dataset.
 *
 *   Net design (defense in depth):
 *     - Gateway endpoint  → PII + safety guardrails on the LLM invocation.
 *     - This module        → blocks all-data reads at the tool/query layer.
 *
 * The check is intentionally conservative: it targets phrasing and query shapes
 * that mean "give me everything" (all rows / every table / SELECT * with no
 * filter / dump / export the database) rather than trying to parse SQL. A blocked
 * attempt throws `AllDataReadBlockedError`, which the tool surfaces to the model
 * as a refusal and records to the case audit trail so the block is evidence.
 */

/** Thrown when a tool input is judged to be an all-data / bulk-exfiltration read. */
export class AllDataReadBlockedError extends Error {
  readonly matched: string;
  constructor(matched: string) {
    super(
      `Blocked by data-access guardrail: this request attempts to read all data ` +
        `("${matched}"). Narrow the request to a specific payment, signal, or ` +
        `bounded set — bulk reads of the full dataset are not permitted.`,
    );
    this.name = 'AllDataReadBlockedError';
    this.matched = matched;
  }
}

// Phrases that signal intent to read the entire dataset. Matched case-insensitively
// as substrings against the natural-language tool input (ask_data question,
// search_playbooks query). Kept explicit + readable so the policy is auditable.
const ALL_DATA_PHRASES: readonly string[] = [
  'all data',
  'all the data',
  'all rows',
  'every row',
  'all records',
  'all the records',
  'entire table',
  'entire database',
  'whole table',
  'whole database',
  'every table',
  'all tables',
  'all of the data',
  'everything in the database',
  'everything in the table',
  'dump all',
  'dump the',
  'dump every',
  'export all',
  'export the database',
  'select *',
  'select all',
  'full dataset',
  'entire dataset',
  'all payments in the system',
  'all citizens',
  'all beneficiaries',
  'every payment',
  'all ssn',
  'all social security',
];

/**
 * Inspect a natural-language tool input for all-data-read intent.
 * Returns the matched phrase (for logging) or null if the input is allowed.
 */
export function detectAllDataRead(input: string): string | null {
  const hay = input.toLowerCase();
  for (const phrase of ALL_DATA_PHRASES) {
    if (hay.includes(phrase)) return phrase;
  }
  return null;
}

/**
 * Enforce the guardrail: throw `AllDataReadBlockedError` if the input attempts
 * an all-data read. Call at the TOP of any tool that turns free-form input into
 * a Lakebase query (ask_data, search_playbooks). No-op for allowed inputs.
 */
export function enforceNoAllDataRead(input: string): void {
  const matched = detectAllDataRead(input);
  if (matched) throw new AllDataReadBlockedError(matched);
}
