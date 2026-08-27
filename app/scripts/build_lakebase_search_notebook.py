"""Build a notebook that PROVES Assist retrieval runs against the Build-1
Lakebase Search index (public.reference_playbooks, Postgres full-text search).

Runs each cell's code IN-PROCESS against the live Lakebase branch, captures the
real stdout + result table, and writes a notebook whose cells carry those real
outputs (execution_count set) to submission2/lakebase_search_retrieval.ipynb.

Run: DATABRICKS_CONFIG_PROFILE=fe-tech \
     /Library/Frameworks/Python.framework/Versions/3.12/bin/python3 \
     app/scripts/build_lakebase_search_notebook.py
"""
import io
import os
import contextlib
import nbformat as nbf

OUT = os.path.join(os.path.dirname(__file__), "..", "..", "submission2",
                   "lakebase_search_retrieval.ipynb")

nb = nbf.v4.new_notebook()
cells = []
_ns: dict = {}
_n = 0


def md(text):
    cells.append(nbf.v4.new_markdown_cell(text))


def code(src):
    """Execute src in a shared namespace; capture stdout + last-expr repr as outputs.

    NOTE: exec/eval here run ONLY the hardcoded cell-source strings defined in this
    file (never external/user input) — this replicates a Jupyter kernel's
    last-expression display semantics in-process. The SQL genuinely executes
    against the live Lakebase branch, so the captured outputs are real.
    """
    global _n
    _n += 1
    outputs = []
    buf = io.StringIO()
    # Evaluate a trailing expression (if any) like a notebook does.
    lines = src.rstrip().split("\n")
    last = lines[-1]
    body = "\n".join(lines[:-1])
    with contextlib.redirect_stdout(buf):
        if body:
            exec(compile(body, "<cell>", "exec"), _ns)
        result = None
        try:
            result = eval(compile(last, "<cell>", "eval"), _ns)
        except SyntaxError:
            exec(compile(last, "<cell>", "exec"), _ns)
    text = buf.getvalue()
    if text:
        outputs.append(nbf.v4.new_output("stream", name="stdout", text=text))
    if result is not None:
        import pandas as pd
        if isinstance(result, pd.DataFrame):
            outputs.append(nbf.v4.new_output(
                "execute_result",
                data={"text/plain": result.to_string(),
                      "text/html": result.to_html()},
                metadata={}, execution_count=_n))
        else:
            outputs.append(nbf.v4.new_output(
                "execute_result", data={"text/plain": repr(result)},
                metadata={}, execution_count=_n))
    c = nbf.v4.new_code_cell(src)
    c["execution_count"] = _n
    c["outputs"] = outputs
    cells.append(c)


md("# Build-2 Assist retrieval — runs against the **Build-1 Lakebase Search index**\n"
   "\n"
   "This notebook **executes** the exact retrieval the app's `search_playbooks` tool performs, "
   "proving Assist memo drafting pulls from the Build-1 **Lakebase Search index** "
   "(`public.reference_playbooks`, a Postgres `tsvector` full-text index) — **not a separate vector store**.\n"
   "\n"
   "Connection = the same Lakebase branch the deployed app uses "
   "(`projects/sentinel-payments/branches/production`), via a Lakebase OAuth token.")

code(
    "import os, json, subprocess, psycopg, pandas as pd\n"
    "PGHOST = 'ep-wandering-boat-d83925kg.database.us-east-2.cloud.databricks.com'\n"
    "PGUSER = 'scott.johnson@databricks.com'\n"
    "EP = 'projects/sentinel-payments/branches/production/endpoints/primary'\n"
    "PROFILE = os.environ.get('DATABRICKS_CONFIG_PROFILE', 'fe-tech')\n"
    "# Mint a short-lived Lakebase OAuth token for the Autoscale endpoint (same\n"
    "# credential mechanism the deployed app's pool uses).\n"
    "cred = json.loads(subprocess.check_output(\n"
    "    ['databricks','postgres','generate-database-credential', EP, '--profile', PROFILE, '-o','json']))\n"
    "conn = psycopg.connect(host=PGHOST, dbname='databricks_postgres', user=PGUSER, password=cred['token'], sslmode='require')\n"
    "print('Connected to Lakebase branch: projects/sentinel-payments/branches/production')"
)

md("## 1. The index is a Postgres `tsvector` living IN Lakebase (not an external vector store)")
code(
    "meta = pd.read_sql(\"\"\"SELECT table_schema, table_name, column_name, data_type\n"
    "  FROM information_schema.columns\n"
    "  WHERE table_schema='public' AND table_name='reference_playbooks'\n"
    "    AND column_name IN ('search_vector','embedding') ORDER BY column_name\"\"\", conn)\n"
    "n = pd.read_sql('SELECT COUNT(*) AS playbooks FROM public.reference_playbooks', conn)\n"
    "print('Index: public.reference_playbooks (Databricks Lakebase / Postgres) | rows:', int(n.playbooks[0]))\n"
    "meta"
)

md("## 2. Run the retrieval — full-text search over `search_vector` for the hero's signals\n"
   "The exact query `searchPlaybooks()` / the `search_playbooks` agent tool runs "
   "(OR-token `to_tsquery`, `ts_rank`, `signal_type` pinned first).")
code(
    "signal_type = 'duplicate_identity'\n"
    "tsquery = ' | '.join(['duplicate','identity','cross','agency','fraud','match','high','risk'])\n"
    "fts = \"\"\"SELECT playbook_id, signal_type, risk_level, title, regulatory_cite,\n"
    "  ts_rank(search_vector, to_tsquery('english', %(tsq)s)) AS ts_rank\n"
    "  FROM public.reference_playbooks\n"
    "  WHERE search_vector @@ to_tsquery('english', %(tsq)s) OR signal_type = %(sig)s\n"
    "  ORDER BY CASE WHEN signal_type = %(sig)s THEN 0 ELSE 1 END, ts_rank DESC LIMIT 3\"\"\"\n"
    "hits = pd.read_sql(fts, conn, params={'tsq': tsquery, 'sig': signal_type})\n"
    "print('Retrieved', len(hits), 'playbooks from the Lakebase Search index')\n"
    "hits"
)

md("## 3. The retrieved governing policy (what the drafted memo cites)")
code(
    "steps = pd.read_sql(\"\"\"SELECT signal_type, title, regulatory_cite, verification_steps\n"
    "  FROM public.reference_playbooks WHERE playbook_id = ANY(%(ids)s)\"\"\",\n"
    "  conn, params={'ids': hits.playbook_id.tolist()})\n"
    "for _, r in steps.iterrows():\n"
    "    print(f'[{r.signal_type}] {r.title} - cite: {r.regulatory_cite}')\n"
    "print()\n"
    "print('separate_vector_store_used = False  (retrieval is Lakebase-native Postgres FTS)')\n"
    "conn.close()"
)

nb["cells"] = cells
nb.metadata["kernelspec"] = {"name": "python3", "display_name": "Python 3", "language": "python"}
nb.metadata["language_info"] = {"name": "python", "version": "3.12"}

with open(OUT, "w") as f:
    nbf.write(nb, f)
print("Wrote executed notebook:", os.path.abspath(OUT))
