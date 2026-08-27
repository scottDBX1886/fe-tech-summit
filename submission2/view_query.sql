-- Live flagged-payment queue — the view the examiner sees each morning.
-- Reads the synced read-only mirror app.payment_position (from the Build-1 Gold
-- table serverless_scottj_techsummit_catalog.sent_benefits.gold_open_queue),
-- LEFT JOIN-ed to:
--   - app.disposition_recommendations → the ML model's recommended disposition
--     + confidence (from gold_disposition_recommendations), and
--   - the LATEST app.case_actions row per payment → the live disposition +
--     status written back by the Act layer (so acted cases show their state).
--
-- Ranked by improper-payment exposure DESC so the highest-risk payments surface
-- at the top. This is the query behind submission2/view_result.json.
--
-- Trigger: the queue is (re)scored by the Build-1 pipeline + boot-time
-- Delta→Lakebase sync (a system update), which ranks payments BEFORE any
-- examiner opens the view — the flag exists because the system scored it, not
-- because a person looked.
SELECT
  p.payment_id,
  p.program,
  p.state,
  p.payment_amount_usd,
  p.n_signals,
  p.signals,
  p.risk_level,
  p.improper_payment_exposure_usd,
  p.projected_recovery_if_investigated_usd,
  dr.recommended_disposition,
  dr.confidence_score,
  la.action_type AS live_disposition,
  la.status      AS action_status
FROM app.payment_position p
LEFT JOIN app.disposition_recommendations dr
  ON dr.payment_id = p.payment_id
LEFT JOIN LATERAL (
  SELECT a.action_type, a.status
  FROM app.case_actions a
  WHERE a.payment_id = p.payment_id
  ORDER BY a.created_at DESC
  LIMIT 1
) la ON true
ORDER BY p.improper_payment_exposure_usd DESC NULLS LAST
LIMIT 25;
