-- Migration 0058: one-time financial reset log.
-- Records the irreversible cleanup of test financial data before production launch.
-- Idempotent and non-destructive by itself; the cleanup is executed only by admin API.

CREATE TABLE IF NOT EXISTS commerce_financial_reset_log (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  singleton_key integer NOT NULL DEFAULT 1,
  executed_by varchar NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  confirmation_phrase text NOT NULL,
  summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  executed_at timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS commerce_financial_reset_once_idx
  ON commerce_financial_reset_log(singleton_key);
