#Milestone 3 — Databricks App
Build the internal tool the person actually uses.

You'll learn: create + deploy a Databricks App from the "Spin Up a Databricks App" template (Lakebase + analytics + model-serving plugins) · app scope permissions + OBO (runs as the user) vs. the app service principal (runs as the SP) · iterative Vibe + DAS build · the discover → recommend → act agent loop with human-in-the-loop · build on the dev branch, keep main clean.

Steps:

3.1 Work locally with Vibe (vibe update first, for the latest Databricks Agent Skills via DAS).
3.2 Start from the bootstrap app in app/ (boots, reads Lakebase, shows the queue + a working ask_data loop). See app/APP_WORKSHOP.md for the gaps.
3.3 Build the three layers: Visualize (done) → Assist (agent + tools + drafting) → Act (write-back with a human approval stop).
Done when: an examiner sees the flagged-payment queue, asks why a payment is flagged, gets a ranked disposition, and approves it — writing back to case_actions and the queue updates live.


###Build 2 · Databricks Apps
How to build the app

####Technical requirements
Deploy the app on Databricks Apps and read the Build 1 synced Unity Catalog table; build progressively, layer by layer, rather than one-shotting.
Never write to the synced Unity Catalog table (read-only in Postgres); persist all app state and actions to writable Postgres tables.
Build against the Build 1 development branch, keeping main as the clean environment to demo from.
Answer the customer's hero question as a decision (surface, prescribe, approve, act), not a lookup or a dashboard.
Steps to be executed
0 / 3

1
Visualize: a live view of the data, ranked or flagged so the important thing is obvious, with a defined trigger (a schedule or system update scores higher than a person opening the view).

2
Assist: an assistant that explains why something is flagged, a scenario explorer for what-if questions, and automated drafting of the memo or note, retrieving from the Build 1 Lakebase Search index rather than a separate vector store.

3
Act: write at least one action back to the writable Postgres table, with a person approving or correcting before it commits, and the committed decision reflected on the next read (closed loop).

####Steps to be executed
0 / 3

1
Visualize: a live view of the data, ranked or flagged so the important thing is obvious, with a defined trigger (a schedule or system update scores higher than a person opening the view).

2
Assist: an assistant that explains why something is flagged, a scenario explorer for what-if questions, and automated drafting of the memo or note, retrieving from the Build 1 Lakebase Search index rather than a separate vector store.

3
Act: write at least one action back to the writable Postgres table, with a person approving or correcting before it commits, and the committed decision reflected on the next read (closed loop).


####Evidence to submit
0 / 7
Save your work in a folder named "submission2", then zip that folder and upload it here. The validator scores Build 2 against submission2 only. Include the following exports:


An export of the writable Postgres action table (writeback_table.json), with the proposed action, the approval status and approver, and the created and committed timestamps.

An export of the Lakebase workflow-state and observability table (state_table.json), capturing trigger events and recorded decisions with timestamps.

The query backing the live view (view_query.sql) and its returned rows (view_result.json).

A log of assistant interactions (assist_log.jsonl) with the request and the model's response for at least one explanation and one what-if run.

A sample of the auto-drafted memo, note, or summary (drafted_sample.md).

The customer's hero question and the linked record IDs that form the decision chain across the exports (hero_question.txt).

A git history export (git_history.txt) from `git log --graph --oneline --decorate --all`, showing the layer-by-layer build on the development branch off main.