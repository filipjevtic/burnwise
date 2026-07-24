-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "costUsd" DOUBLE PRECISION,
ADD COLUMN     "durationSeconds" INTEGER,
ADD COLUMN     "provider" TEXT,
ADD COLUMN     "totalTokens" INTEGER;

-- CreateIndex
CREATE INDEX "Event_projectId_eventType_idx" ON "Event"("projectId", "eventType");

-- Backfill denormalized metrics from existing payload JSON (#176). Mirrors the
-- deriveEventMetrics() logic: totalTokens/provider on llm.response, costUsd on
-- llm.response + ci.run, durationSeconds on session.activity. Numeric values are
-- regex-guarded before casting so malformed payloads can't fail the migration.
UPDATE "Event" SET
  "totalTokens" = CASE
    WHEN "eventType" = 'llm.response'
      AND "payload"->>'totalTokens' ~ '^-?[0-9]+(\.[0-9]+)?$'
    THEN round(("payload"->>'totalTokens')::numeric)::integer
    ELSE NULL END,
  "costUsd" = CASE
    WHEN "eventType" IN ('llm.response', 'ci.run')
      AND "payload"->>'costUsd' ~ '^-?[0-9]+(\.[0-9]+)?$'
    THEN ("payload"->>'costUsd')::double precision
    ELSE NULL END,
  "durationSeconds" = CASE
    WHEN "eventType" = 'session.activity'
      AND "payload"->>'durationSeconds' ~ '^-?[0-9]+(\.[0-9]+)?$'
    THEN round(("payload"->>'durationSeconds')::numeric)::integer
    ELSE NULL END,
  "provider" = CASE
    WHEN "eventType" = 'llm.response'
      AND length(trim(coalesce("payload"->>'provider', ''))) > 0
    THEN "payload"->>'provider'
    ELSE NULL END
WHERE "eventType" IN ('llm.response', 'ci.run', 'session.activity');
