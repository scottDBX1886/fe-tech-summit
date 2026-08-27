/**
 * Export Lakebase evidence for submission2 (read-only). Pulls the writable
 * case_actions table, the workflow-state/audit view, and the live queue view.
 * Run: DATABRICKS_CONFIG_PROFILE=fe-tech DATABRICKS_APP_PORT=8790 tsx scripts/export_evidence.ts
 */
import 'dotenv/config';
import { writeFileSync } from 'node:fs';
import { createApp, server, lakebase, analytics } from '@databricks/appkit';
import { sql } from 'drizzle-orm';
import { createDb } from '../server/db/index.js';

const OUT = '../submission2';

await createApp({
  plugins: [server(), lakebase(), analytics({})],
  async onPluginsReady(appkit) {
    const db = createDb(appkit.lakebase.pool);

    // 1) writeback_table.json — the writable action table (proposed action,
    //    approval status + approver, created + committed timestamps).
    const wb = await db.execute(sql`
      SELECT id, payment_id, action_type, hold_duration_hours, drafted_request,
             predicted_recovery_usd, status, approved_by, reviewed_by_role,
             audit_trail, created_at, decided_at
      FROM app.case_actions
      ORDER BY created_at DESC
    `);
    writeFileSync(`${OUT}/writeback_table.json`, JSON.stringify(wb.rows, null, 2));
    console.log('writeback_table.json:', wb.rows.length, 'rows');

    // 2) state_table.json — workflow-state + observability: each recorded
    //    decision flattened with its trigger/audit events + timestamps.
    const st = await db.execute(sql`
      SELECT a.id AS action_id, a.payment_id, a.action_type, a.status,
             a.approved_by, a.predicted_recovery_usd,
             a.created_at AS proposed_at, a.decided_at AS committed_at,
             evt.value ->> 'at'     AS event_at,
             evt.value ->> 'by'     AS event_by,
             evt.value ->> 'action' AS event_action,
             evt.value ->> 'notes'  AS event_notes
      FROM app.case_actions a
      LEFT JOIN LATERAL jsonb_array_elements(a.audit_trail) AS evt(value) ON true
      ORDER BY a.created_at DESC, event_at ASC
    `);
    writeFileSync(`${OUT}/state_table.json`, JSON.stringify(st.rows, null, 2));
    console.log('state_table.json:', st.rows.length, 'rows');

    // 3) view_result.json — the live ranked queue (top of what the examiner
    //    sees): open flagged payments ranked by improper-payment exposure,
    //    joined to the ML recommended disposition. Mirrors listPayments(open).
    const view = await db.execute(sql`
      SELECT p.payment_id, p.program, p.state, p.payment_amount_usd,
             p.n_signals, p.signals, p.risk_level,
             p.improper_payment_exposure_usd,
             p.projected_recovery_if_investigated_usd,
             dr.recommended_disposition, dr.confidence_score,
             la.action_type AS live_disposition, la.status AS action_status
      FROM app.payment_position p
      LEFT JOIN app.disposition_recommendations dr ON dr.payment_id = p.payment_id
      LEFT JOIN LATERAL (
        SELECT a.action_type, a.status FROM app.case_actions a
        WHERE a.payment_id = p.payment_id ORDER BY a.created_at DESC LIMIT 1
      ) la ON true
      ORDER BY p.improper_payment_exposure_usd DESC NULLS LAST
      LIMIT 25
    `);
    writeFileSync(`${OUT}/view_result.json`, JSON.stringify(view.rows, null, 2));
    console.log('view_result.json:', view.rows.length, 'rows');

    process.exit(0);
  },
});
