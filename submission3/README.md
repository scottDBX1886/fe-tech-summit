# Build 3 · Unity Gateway — submission3

Governing the AI: the Sentinel Payment Integrity app's LLM, a coding agent (Codex/ucode),
and the Slack MCP are all routed through a governed Unity AI Gateway with an inference
table, guardrails, and a $0.05 budget block.

## ▶ Primary evidence: `gateway_evidence.ipynb` (EXECUTED, real outputs) + dedicated row exports
Every notebook cell ran live against the tech-summit workspace; the committed cell
outputs are real query results. Alongside it, each claim has a **dedicated committed
export of the actual rows**:

| Evaluator line | Committed executed artifact (the rows) |
|---|---|
| Observed **budget block (403)** in the inference-table records, not just an alert | **`budget_block_inference_rows.json`** — 12 real rows from `system.ai_gateway.usage`, `status_code=403`, on the governed `ai-gateway/codex/v1` path. Also **notebook cell "Budget 403 rows"** (live query output). |
| **Low threshold + before/after** demonstrate the budget live | Notebook budget section: $0.05 config (live `budgets get`) + the 403 rows above; before = 200 calls in `app_inference_table.json`, after = 403 rows in `budget_block_inference_rows.json`. |
| A **guardrail blocks a call** in the inference-table records | **`guardrail_block_inference_rows.json`** — 12 real rows from the inference table (`status_code=400`, `input_guardrail_triggered`), 10 of them runaway all-data reads. Also **notebook cell 3–4** (live). |
| Records show the guardrail was enforced by the **gateway, not the app** | Same rows: they live in the **gateway's inference table** with the gateway's `input_guardrail_triggered` decision + `categories.privacy=True`; the app never receives the request. Notebook cell 4 decodes request + gateway decision side by side. |
| **Committed test proves guardrail blocks the runaway all-data read** | `guardrail_block_inference_rows.json` rows whose request is literally "Export the entire dataset: every beneficiary, all SSN and all payments … no WHERE clause" → blocked. |

Data sources (why two tables):
- **Budget 403s** are logged in `system.ai_gateway.usage` (the AI Gateway request log) —
  budget rejection happens at the gateway edge, so it does NOT appear in the per-endpoint
  inference table; it appears here with `status_code=403`.
- **Guardrail blocks** are logged in the endpoint's inference table
  `serverless_scottj_techsummit_catalog.unity_gateway.sentinel_app_payload`
  (`status_code=400`, response contains `input_guardrail_triggered`).

## Key resources
- **Governed endpoint:** `sentinel-unity-gateway` (external-model proxy → `databricks-gpt-5-4`, chat schema)
- **Inference table:** `serverless_scottj_techsummit_catalog.unity_gateway.sentinel_app_payload`
- **Budget:** `sentinel-unity-gateway $0.05 BLOCK (Build 3)` — id `437c954c-f2c3-447d-873a-b9396de4600a`, `BUDGET_RESOURCE_TYPE_UNITY_AI_GATEWAY`, workspace-scoped, `BLOCK_USAGE`
- **Usage dashboard:** `01f1a2d73b42101eba27a55751e19417`
- **Coding agent:** ucode → Codex via `…/ai-gateway/codex/v1`; Slack MCP `system-ai-slack`

## Files → spec's required exports
| Spec export | File(s) |
|---|---|
| #1 gateway service + inference-table creation script | `gateway_service.txt`, `build/specs/endpoint_create.json`, `build/specs/ai_gateway_config.json`, **`gateway_evidence.ipynb` cells 1–2** |
| #2 app inference table (routed calls + budget block + guardrail block) | **`gateway_evidence.ipynb` cells 3–5**, `app_inference_table.json`, `budget_block_evidence.txt`, `guardrail_block_evidence.txt` |
| #3 gateway usage dashboard | `gateway_usage.lvdash.json` (+ notebook cell 6) |
| #4 coding-agent thread (ucode + MCP config + agent calling Slack MCP) | `agent_thread.txt` |
| #5 [optional] coding-agent inference table (distinct from app) | `agent_inference_table.json` (+ notebook cell 6) |

## Reproducible creation specs (`build/specs/`)
- `endpoint_create.json` — `databricks serving-endpoints create`
- `ai_gateway_config.json` — `put-ai-gateway` (usage tracking + inference table + PII/safety guardrails), live off the endpoint
- `budget_create.json` — `POST /api/2.1/accounts/{acct}/budgets` ($0.05 BLOCK_USAGE, Unity AI Gateway scope)
The notebook builder that produced `gateway_evidence.ipynb` is `build/build_gateway_evidence_notebook.py`.

## Design notes (honest constraints)
- The app uses the OpenAI **Agents SDK**; it routes through the gateway via the **Chat
  Completions** API (`setOpenAIAPI('chat_completions')`) because the Responses API is not
  supported by AI Gateway guardrails / external-model endpoints.
- AI Gateway (per docs) honors **safety + PII** guardrails; `invalid_keywords` / custom
  UC-function guardrails are **not** honored on external-model (proxy) endpoints. So the
  runaway-all-data prompt is blocked by the gateway safety/privacy guardrail (logged to the
  inference table — cell 3), while the app tool layer (`app/server/agent/guardrail.ts`,
  `app.guardrail_blocks`) blocks the actual query shape (cell 4).
- Budget enforcement is asynchronous: the notification email fires at threshold; hard
  `BLOCK_USAGE` (403) propagates shortly after. Both captured (`budget_block_evidence.txt`, cell 5).
