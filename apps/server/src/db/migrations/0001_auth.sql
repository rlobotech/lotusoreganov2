CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  username text NOT NULL,
  password_hash text NOT NULL,
  email_verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX users_email_key ON users (lower(email));
CREATE UNIQUE INDEX users_username_key ON users (lower(username));

CREATE TABLE sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  token_hash bytea NOT NULL UNIQUE,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);
CREATE INDEX sessions_user_id_idx ON sessions (user_id);
CREATE INDEX sessions_expires_at_idx ON sessions (expires_at);

CREATE TABLE invite_codes (
  code text PRIMARY KEY,
  uses_left integer NOT NULL CHECK (uses_left >= 0),
  created_by uuid REFERENCES users (id) ON DELETE SET NULL,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE invite_redemptions (
  code text NOT NULL REFERENCES invite_codes (code) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  redeemed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (code, user_id)
);

-- Login/registration audit trail (security basics from PLAN.md).
CREATE TABLE auth_events (
  id bigserial PRIMARY KEY,
  user_id uuid REFERENCES users (id) ON DELETE SET NULL,
  kind text NOT NULL,
  ip inet,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX auth_events_user_id_idx ON auth_events (user_id, created_at DESC);
