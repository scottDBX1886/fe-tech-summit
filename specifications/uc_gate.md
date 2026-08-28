Build 3 · Unity Gateway
How to govern the AI

Technical requirements
Add budgets block calls exceeding $x. Choose a low threshold that can be demonstrated, for example, x = $0.05.
Add guardrails to LLM invocations to prevent all Lakebase data from being read.
Enable inference table tracing for all LLM calls from the app so that platform teams can investigate historical queries using inference tables.
To extend governance to other agentic workflows, the platform team must route all coding-agent traffic through a governed gateway, including MCP calls made by coding agents.


Route the app
0 / 3

3
Programmatically create the model service for the LLM called by app and enable a corresponding inference tableHide
Options for programmatic creation: API, SDK (i.e. Python), or Terraform
Use tech-summit external location for inference table catalog

4
Add custom guardrail blocking calls attempting to query all data

5
Update the app endpoint to route LLM requests through Unity Gateway


Extend to the agent and MCP
0 / 3

6
Onboard coding agent with Unity Gateway (use ucode with coding agent)

7
Onboard Slack MCP with Unity Gateway and add to coding agentHide
Authenticate Slack: AI Gateway → MCPs → slack → Login
Configure for the coding agent: ucode configure mcp --services system.ai.slack

8
Use Slack MCP to search instructions on solution for guardrails

Prove it and report
0 / 2

9
Perform test verifying guardrails work for app, and budgets work for all AI resources

10
Use dashboards on usage to generate report for executive team, capture coding agent, MCP, and app agent usage

Bonus points
Route the coding agent through its own governed endpoint.
Bonus points/ optional - enhanced coding agent governance:

Route coding agent calls through a custom model service with its own inference table traces. Requires ucode to be used with Codex (+ GPT model).
Hint: Show that this coding agent is not governed by the same guardrail as the app.

Guide: https://docs.google.com/document/d/1dwCXaRnAD9tNhNZP-OE09PHpi6rGXiie5f0YSef0VEU/edit?tab=t.0#heading=h.5c83glp0ix4m

Evidence to submit
0 / 5
Save your work in a folder named "submission3", then zip that folder and upload it here. The validator scores Build 3 against submission3 only. Include the following exports:


The Unity Gateway model-service and inference-table creation script (gateway_service.txt).

An export of the app's inference table (app_inference_table.json), showing the app's calls routed through the gateway, the observed budget block (the rejection once the threshold is crossed), and the guardrail blocking the runaway all-data read.

An export of the gateway usage dashboard, tracking usage and budgets across the app, the coding agent, and the MCP (gateway_usage.lvdash.json).

A .txt file with the coding-agent thread: the call to ucode, the MCP configuration, and the agent calling the Slack MCP (agent_thread.txt).

[OPTIONAL] An export of the coding agent's inference table, distinct from the app's (agent_inference_table.json).


***Config alone is not proof it fired. Each export must show the gateway actually handling a call.***