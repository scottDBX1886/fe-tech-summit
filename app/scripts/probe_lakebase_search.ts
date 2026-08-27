/** Probe the Lakebase Postgres branch for the Build-1 reference-playbooks
 *  full-text search index (read-only).
 *  Run: DATABRICKS_CONFIG_PROFILE=fe-tech DATABRICKS_APP_PORT=8792 tsx scripts/probe_lakebase_search.ts */
import 'dotenv/config';
import { createApp, server, lakebase, analytics } from '@databricks/appkit';
import { sql } from 'drizzle-orm';
import { createDb } from '../server/db/index.js';

await createApp({
  plugins: [server(), lakebase(), analytics({})],
  async onPluginsReady(appkit) {
    const db = createDb(appkit.lakebase.pool);

    // 1) What tables exist in public (the Lakebase branch)?
    const tables = await db.execute(sql`
      SELECT table_schema, table_name
      FROM information_schema.tables
      WHERE table_schema NOT IN ('pg_catalog','information_schema')
      ORDER BY table_schema, table_name
    `);
    console.log('TABLES:', JSON.stringify(tables.rows));

    // 2) Is there a reference_playbooks table + a tsvector column?
    const cols = await db.execute(sql`
      SELECT table_schema, table_name, column_name, data_type
      FROM information_schema.columns
      WHERE table_name ILIKE '%playbook%'
      ORDER BY table_schema, table_name, ordinal_position
    `);
    console.log('PLAYBOOK COLS:', JSON.stringify(cols.rows));

    // 3) Try a full-text search against it (the Lakebase Search index).
    try {
      const hit = await db.execute(sql`
        SELECT signal_type, risk_level, title
        FROM public.reference_playbooks
        WHERE search_vector @@ to_tsquery('english', 'fraud & identity')
        LIMIT 3
      `);
      console.log('FTS HIT:', JSON.stringify(hit.rows));
    } catch (e) {
      console.log('FTS on public.reference_playbooks failed:', (e as Error).message);
    }
    process.exit(0);
  },
});
