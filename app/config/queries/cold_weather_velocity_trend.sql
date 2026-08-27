-- ╔══════════════════════════════════════════════════════════════════════╗
-- ║ Sentinel analytics — SQL-warehouse queries over the Gold Delta       ║
-- ║ tables. Tables are referenced via IDENTIFIER() built from :catalog +  ║
-- ║ :schema (bound at runtime by charts.ts) so the same SQL resolves on   ║
-- ║ any workspace. Register a query in charts.ts's QUERY_FILES map + ref   ║
-- ║ it from AnalyticsView.tsx.                                             ║
-- ╚══════════════════════════════════════════════════════════════════════╝
-- Payment integrity story, in one chart: fraud-flag distribution by program
-- over the past 3 weeks. Shows which benefit programs are most affected
-- by the fraud-match spike.
--
-- Reads gold_open_queue (the consolidated flagged-payment queue — see
-- specifications/01-lakeflow.md). If your queue names it differently,
-- update the table + column names here.
-- @param catalog STRING = serverless_scottj_techsummit_catalog
-- @param schema STRING = sent_benefits
SELECT
  date_trunc('week', p.queue_date) AS week,
  p.risk_level,
  CAST(COUNT(*) AS BIGINT) AS flagged
FROM IDENTIFIER(:catalog || '.' || :schema || '.gold_open_queue') p
WHERE p.queue_date >= date_sub(current_date(), 63)
GROUP BY date_trunc('week', p.queue_date), p.risk_level
ORDER BY week
