CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS reading_schedule (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id varchar NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  book_id varchar NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  title varchar(255) NOT NULL,
  description text,
  scheduled_start timestamp NOT NULL,
  scheduled_end timestamp,
  estimated_duration integer,
  start_chapter integer NOT NULL DEFAULT 1,
  start_position text,
  end_chapter integer,
  end_position text,
  status varchar(20) NOT NULL DEFAULT 'scheduled',
  session_id varchar REFERENCES reading_sessions(id),
  is_recurring boolean NOT NULL DEFAULT false,
  recurring_pattern text,
  reminder_minutes integer DEFAULT 15,
  reminders_sent boolean NOT NULL DEFAULT false,
  actual_start timestamp,
  actual_end timestamp,
  attendees_count integer DEFAULT 0,
  created_by varchar NOT NULL REFERENCES users(id),
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reading_schedule_club_id ON reading_schedule(club_id);
CREATE INDEX IF NOT EXISTS idx_reading_schedule_book_id ON reading_schedule(book_id);
CREATE INDEX IF NOT EXISTS idx_reading_schedule_status ON reading_schedule(status);
CREATE INDEX IF NOT EXISTS idx_reading_schedule_scheduled_start ON reading_schedule(scheduled_start);
CREATE INDEX IF NOT EXISTS idx_reading_schedule_created_by ON reading_schedule(created_by);
CREATE INDEX IF NOT EXISTS idx_reading_schedule_session_id ON reading_schedule(session_id);

ALTER TABLE reading_schedule
  ADD COLUMN IF NOT EXISTS calendar_sequence integer NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS calendar_subscription_tokens (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash text NOT NULL UNIQUE,
  user_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  club_id varchar NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  revoked_at timestamp NULL,
  last_used_at timestamp NULL,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS calendar_subscription_tokens_token_hash_idx
  ON calendar_subscription_tokens(token_hash);

CREATE INDEX IF NOT EXISTS calendar_subscription_tokens_user_club_idx
  ON calendar_subscription_tokens(user_id, club_id);

CREATE INDEX IF NOT EXISTS calendar_subscription_tokens_club_idx
  ON calendar_subscription_tokens(club_id);
