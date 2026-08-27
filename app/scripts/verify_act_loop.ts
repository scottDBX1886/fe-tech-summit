/**
 * Verify the Act closed loop WITHOUT the model: call recordCaseAction (the exact
 * write the agent's execute_case_action tool performs) for PAY-0000214, then
 * re-read the payment and confirm liveDisposition/actionStatus reflect the write.
 * Run: DATABRICKS_CONFIG_PROFILE=fe-tech tsx scripts/verify_act_loop.ts
 */
import 'dotenv/config';
import { createApp, server, lakebase, analytics } from '@databricks/appkit';
import { createDb } from '../server/db/index.js';
import { recordCaseAction, getPayment, listActionsForPayment } from '../server/db/queries/cases.js';

const HERO = 'PAY-0000214';

await createApp({
  plugins: [server(), lakebase(), analytics({})],
  async onPluginsReady(appkit) {
    const db = createDb(appkit.lakebase.pool);

    const before = await getPayment(db, HERO);
    console.log('[before] liveDisposition:', before?.liveDisposition, '| actionStatus:', before?.actionStatus);

    const rec = await recordCaseAction(db, {
      paymentId: HERO,
      actionType: 'hold_for_verification',
      holdDurationHours: 48,
      draftedRequest:
        'Hold PAY-0000214 (Child Care, UT) 48h: duplicate_identity + cross_agency_fraud_flag. Verify identity vs. cross-agency match before disbursement.',
      predictedRecoveryUsd: 177.51,
      approvedBy: 'scott.johnson@databricks.com',
      auditEntry: {
        at: new Date().toISOString(),
        by: 'scott.johnson@databricks.com',
        action: 'approved',
        notes: 'Held 48h pending manual verification per duplicate_identity flag',
      },
    });
    console.log('[write] inserted case_action id:', rec.id, '| status:', rec.status);

    const after = await getPayment(db, HERO);
    console.log('[after]  liveDisposition:', after?.liveDisposition, '| actionStatus:', after?.actionStatus);

    const actions = await listActionsForPayment(db, HERO);
    console.log('[loop]   case_actions rows for hero:', actions.length);
    process.exit(0);
  },
});
