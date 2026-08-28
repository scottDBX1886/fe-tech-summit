# Interactive steps (browser OAuth — run these in YOUR terminal)

Claude prepped everything else. These two need a human browser login.
Run each with the `! ` prefix in the Claude prompt so output returns to the session,
OR run in a normal terminal and paste the output back.

────────────────────────────────────────────────────────
## A) Account login (for the $0.05 budget block) — AWS account console
────────────────────────────────────────────────────────

    databricks auth login \
      --host https://accounts.cloud.databricks.com \
      --account-id 0d26daa6-5e44-4c97-a497-ef015f91254a \
      --profile fe-account

Approve in browser. Then verify:

    databricks account budgets list --profile fe-account

Once this works, tell Claude — it creates the $0.05 BLOCK_USAGE budget.

────────────────────────────────────────────────────────
## B) ucode — point coding agent at tech-summit workspace + add Slack MCP
────────────────────────────────────────────────────────

ucode is already installed + configured for the Azure DEFAULT workspace.
For Build 3 we want the coding agent governed by THIS account's gateway and
the Slack MCP onboarded.

### B1. (In the AI Gateway UI, first) authenticate Slack:
    AI Gateway → MCPs → slack → Login
(Workspace: https://fe-sandbox-serverless-scottj-techsummit.cloud.databricks.com)

### B2. Point ucode/Codex at the tech-summit workspace (governed endpoint):
    ucode configure --agents codex
    # when prompted, enter workspace URL:
    #   https://fe-sandbox-serverless-scottj-techsummit.cloud.databricks.com
    # profile name: fe-tech   (reuse existing)
    # Look for: ✔ Codex is working

### B3. Configure the Slack MCP for the coding agent (Unity Gateway governed):
    ucode configure mcp --services system.ai.slack

### B4. Verify + capture (Claude will assemble agent_thread.txt from this):
    ucode status
    codex mcp list

### B5. Use the Slack MCP from the coding agent to search guardrail instructions
(step 8). Launch the governed coding agent and ask it to use Slack MCP:
    codex --profile ucode
    # then inside the session, prompt:
    #   "Use the Slack MCP to search our workspace for instructions/messages
    #    about the solution for AI guardrails (all-data-read / query-all-data).
    #    Summarize what you find and cite the channels/messages."

Paste the transcript back to Claude → it becomes agent_thread.txt (evidence #4).
