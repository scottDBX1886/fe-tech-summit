/** Verify searchPlaybooks retrieves the governing playbooks from the Build-1
 *  Lakebase Search index for the hero's signals.
 *  Run: DATABRICKS_CONFIG_PROFILE=fe-tech DATABRICKS_APP_PORT=8793 tsx scripts/verify_playbook_search.ts */
import 'dotenv/config';
import { createApp, server, lakebase, analytics } from '@databricks/appkit';
import { createDb } from '../server/db/index.js';
import { searchPlaybooks } from '../server/db/queries/cases.js';

await createApp({
  plugins: [server(), lakebase(), analytics({})],
  async onPluginsReady(appkit) {
    const db = createDb(appkit.lakebase.pool);
    const hits = await searchPlaybooks(
      db,
      'duplicate identity cross agency fraud match high risk',
      { signalType: 'duplicate_identity', limit: 3 },
    );
    for (const p of hits) {
      console.log(`[${p.rank.toFixed(4)}] ${p.signalType} — ${p.title} | cite: ${p.regulatoryCite}`);
    }
    console.log('total hits:', hits.length);
    process.exit(0);
  },
});
