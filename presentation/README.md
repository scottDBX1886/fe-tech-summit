# Workshop - Sentinel (Improper-Payment & Pre-Disbursement Fraud Prevention)

**The use case, in plain words:** Sentinel is a federal benefits-payment agency. A cross-agency fraud-match feed + an eligibility-data refresh arrived ~3 weeks ago and surfaced a spike of high-risk payments in the pre-disbursement queue. You build an app that spots each flagged payment, recommends the best disposition — **hold for verification, release to disburse, or refer to investigation** — and lets an examiner approve it in one click. The data, the recommendation, and the AI that assists are all governed on Databricks.

## 🎓 Start here — you build this, it isn't pre-built

Starting point for the Tech Summit FY27 Live Days **AI Customer Challenge**. It ships the **data
generator + specs + a bootstrap app** — **you build the solution** (that's the exercise). Build like
a citizen developer: **describe your intent to Genie Code and iterate**. Work carries forward
milestone → milestone.

### ▶️ How to start

**1. Get the template into your workspace.** Download it from **go/solution-builder** and import the folder into your Databricks workspace (Workspace → *Import*). Everything you need travels with it — work directly from there.

**2. Open a Genie Code session** in that folder and kick it off with this prompt:

> *"Read `README.md`, then all the files under `specifications/`, to build up the full context of
> this workshop — the story, the data model, and each component I need to create. Then read
> `data_generation/generate_data.py` to understand how the raw data is structured. Before doing
> anything, ask me which **catalog and schema** to use. Then run `data_generation/generate_data.py`
> as a **job run** into that catalog/schema to load the raw data. Put all the files you create in
> this project folder — transformation code under `./transformation`, and the dashboard, Genie
> space, and everything else at the root (`./`)."*

From there, build the four milestones below one at a time (SDP pipeline, dashboard, Genie, Lakebase, app, gateway).

**3. Build the four milestones below**, iterating with Genie Code. For the app, point your agent at `app/APP_WORKSHOP.md`.

### What YOU need to create — the four milestones

#### Milestone 1 — Data
*Build the governed data layer the whole solution runs on.*

**You'll learn:** Spark Declarative Pipelines · the medallion model · in-SQL AI (`ai_classify`) · Metric Views · AI/BI dashboards + Genie.

**Steps:**
- **1.1** Run `data_generation/generate_data.py` as a job to load the raw data.
- **1.2** Ask Genie for a data-exploration notebook to understand the data before modeling.
- **1.3** Build the SDP pipeline (`01-lakeflow.md`) → silver + gold + the `gold_disposition_recommendations` heuristic.
- **1.4** Create the metric view `mv_payment_risk` (`02-uc-governance.md`).
- **1.5** Build the AI/BI dashboard + Genie space (`04-ai-bi.md`), saved at the root.
- **1.6** *(Optional)* Train the ML disposition model (`03-ml-disposition.md`) to overwrite the recommendations.

**Done when:** a running pipeline produces the governed gold tables + metric view + recommendations, with a dashboard and Genie space that answer the story.

#### Milestone 2 — Lakebase
*Serve the data at low latency + add the operational store the app writes to.*

**You'll learn:** Lakebase (managed Postgres) · syncing UC tables (read-only) vs. a writable table · dev branches · Lakebase Search (hybrid).

**Steps:**
- **2.1** Create a Lakebase instance (autoscaling) + a dev branch to iterate safely.
- **2.2** Sync the gold tables in as low-latency **read-only** copies.
- **2.3** Add your own **writable** table `case_actions` for approved decisions (you can't write to a synced table).
- **2.4** Enable Lakebase Search on a benefits reference table (e.g., `reference_playbooks` or beneficiary metadata) — powers the app's **evidence docket** + verification guidance retrieval.

**Done when:** the gold tables are queryable from Postgres, a writable `case_actions` table exists, and reference search is ready.

#### Milestone 3 — Databricks App
*Build the internal tool the person actually uses.*

**You'll learn:** create + deploy a Databricks App from the "Spin Up a Databricks App" template (Lakebase + analytics + model-serving plugins) · app scope permissions + OBO (runs as the user) vs. the app service principal (runs as the SP) · iterative Vibe + DAS build · the discover → recommend → act agent loop with human-in-the-loop · build on the dev branch, keep main clean.

**Steps:**
- **3.1** Work locally with **Vibe** (`vibe update` first, for the latest [Databricks Agent Skills](https://github.com/databricks/databricks-agent-skills) via DAS).
- **3.2** Start from the **bootstrap app in `app/`** (boots, reads Lakebase, shows the queue + a working `ask_data` loop). See **`app/APP_WORKSHOP.md`** for the gaps.
- **3.3** Build the three layers: **Visualize** (done) → **Assist** (agent + tools + drafting) → **Act** (write-back with a human approval stop).

**Done when:** an examiner sees the flagged-payment queue, asks why a payment is flagged, gets a ranked disposition, and approves it — writing back to `case_actions` and the queue updates live.

#### Milestone 4 — Unity AI Gateway
*Govern the AI the app calls.*

**You'll learn:** Unity AI Gateway · spend caps · content-filter guardrails · inference logging to UC · per-entity attribution.

**Steps:**
- **4.1** Create the AI Gateway with a spend cap, guardrails, and inference logging to a UC table.
- **4.2** Route the app's model calls through it.

**Done when:** every AI call goes through the governed Gateway — capped, guardrailed, logged, and attributable per payment examined.

Everything below is the **story + reference spec** the build should realize. The `specifications/`
folder has the full detail per component; `resources.json` lists the capabilities.

---

## The Story

| | |
|---|---|
| **Company** | Sentinel — federal benefits-payment agency (~$40B annual disbursements, ~2M active beneficiaries, multiple programs) |
| **Hero** | Priya Raman, Director of Program Integrity (non-technical) |
| **Problem** | A cross-agency fraud-match feed + eligibility-data refresh ~3 weeks ago surfaced a spike of high-risk pre-disbursement payments in the queue |
| **Investigation** | Priya asks *"Payment PAY-0000214 is flagged as likely improper. Should we hold it, pay it, or send it to investigation?"* — the platform ranks the three dispositions by projected recovery vs. citizen-delay cost |
| **Root cause** | New fraud-match signals (duplicate identity, deceased payee, cross-agency flag) + income-eligibility anomalies triggered by an eligibility refresh created a wave of high-risk payments concentrated in the past 21 days |
| **Impact** | ~$280M in pre-disbursement queue flagged; ~$12M identified as high-risk improper-payment exposure if released; examiner review velocity is 50 cases/day, so bottleneck without prioritization |

---

## Overview

Priya Raman (Director of Program Integrity) opens her queue console and sees the pre-disbursement payments color-coded: **red** for high-risk improper-payment flags (stacked signals: duplicate identity, deceased, income mismatch, cross-agency fraud match) and **yellow** for lower-risk or single-signal flags. She asks about the worst case — *"Payment PAY-0000214 has multiple fraud signals — should we hold it, release it, or investigate?"* — and the app ranks **release / hold-for-verification / refer-to-investigation** by projected recovery, recommends hold-for-verification based on the stacked signals and high payment amount, and drafts a verification request to the other agency. She approves; the case action writes back to Lakebase so the next examiner pull shows the hold/release/investigation status — stopping an improper payment before funds disburse. Governed data, a governed recommendation, and a governed AI assistant, end to end.

---

## Key Numbers

| Metric | Value |
|--------|-------|
| Benefits programs | 5 (TANF, SNAP, Child Care, Disability, Veteran's) |
| Annual disbursements | ~$40B |
| Active beneficiaries | ~2M |
| Pre-disbursement queue depth | ~$280M (per day snapshot) |
| Payments flagged with risk signals | ~180 sampled (thousands / ~$42M at real scale — talk-track) |
| High-risk improper-payment exposure (multiple stacked signals) | ~$0.36M sampled (~$12M+ at real scale — talk-track) |
| Flagged-rate spike | ~5% pre-wave → ~30%+ post-wave (last ~3 weeks) — visible on the trend chart |
| Payment types flagged | ~1,100 unique (across programs + payment modalities) |
| Examiner review capacity | ~50 cases/day per person |
| Signal types (fraud, eligibility, cross-agency) | ~8 (duplicate ID, deceased, income mismatch, benefit-program overlap, cross-agency fraud flag, employment mismatch, residence mismatch, manual-review flag) |
| Disposition mix (validated, learnable 3-way) | ~35% release / ~43% hold-for-verification / ~22% refer-to-investigation |
| Assistant AI spend | Capped, per-case attributable, ~$2M/yr bounded |

---

## The demo arc (what the finished solution shows)

1. **See it** — open the Payment Queue app: a prioritized list of pre-disbursement payments, color-coded by risk (red high-risk / yellow moderate / green low-risk), with improper-payment exposure + flagged count + held count KPIs.
2. **Ask why** — in the chat dock, ask why Payment PAY-0000214 is flagged; the assistant investigates via Genie over the governed lakehouse.
3. **Get the move** — the assistant ranks release / hold-for-verification / refer-to-investigation by projected recovery vs. delay cost and recommends hold-for-verification, with a what-if (what if we release and discover fraud later).
4. **Act** — approve → the disposition + a case memo + verification request (if needed) write back to Lakebase → the queue and KPIs update live.
5. **Governed AI** — every assistant call runs through Unity AI Gateway (spend cap, guardrails, per-case logging).

Full per-component detail is in `specifications/`; the build steps are the four milestones above.
