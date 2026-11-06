-- A party and its whole simulation state (see packages/world PartyState). Characters live inside the
-- state for now; they get their own tables when the management UI needs to edit them (M4).
CREATE TABLE parties (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  name text NOT NULL,
  mode text NOT NULL CHECK (mode IN ('standard', 'hardcore')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'dead')),
  world_id text NOT NULL DEFAULT 'starter',
  state jsonb NOT NULL,
  next_tick_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
-- The scheduler's hot query: active parties whose activity has finished.
CREATE INDEX parties_due_idx ON parties (next_tick_at) WHERE status = 'active';
CREATE INDEX parties_owner_idx ON parties (owner_user_id);
-- Slots: one active solo party per account for now. A lost hardcore party frees its slot.
CREATE UNIQUE INDEX parties_one_active_solo ON parties (owner_user_id) WHERE status = 'active';

CREATE TABLE combat_replays (
  id bigserial PRIMARY KEY,
  party_id uuid NOT NULL REFERENCES parties (id) ON DELETE CASCADE,
  title text NOT NULL,
  outcome text NOT NULL,
  -- Boss fights, defeats and epic drops live in their own small pool outside the 100-replay ring.
  pinned boolean NOT NULL DEFAULT false,
  engine_version text NOT NULL,
  log_format_version integer NOT NULL,
  -- gzip-compressed JSON event log
  blob bytea NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX combat_replays_party_idx ON combat_replays (party_id, pinned, id DESC);

CREATE TABLE party_events (
  id bigserial PRIMARY KEY,
  party_id uuid NOT NULL REFERENCES parties (id) ON DELETE CASCADE,
  at timestamptz NOT NULL,
  kind text NOT NULL,
  payload jsonb NOT NULL,
  replay_id bigint REFERENCES combat_replays (id) ON DELETE SET NULL
);
CREATE INDEX party_events_party_idx ON party_events (party_id, id);

-- How far each user has watched the "while you were away" slideshow, per party.
CREATE TABLE user_party_seen (
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  party_id uuid NOT NULL REFERENCES parties (id) ON DELETE CASCADE,
  last_seen_event_id bigint NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, party_id)
);
