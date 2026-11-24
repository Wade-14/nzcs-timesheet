-- People who can log in, and their logins (sessions).
CREATE TABLE people (
  id           TEXT PRIMARY KEY,
  first_name   TEXT NOT NULL,
  last_name    TEXT NOT NULL,
  role         TEXT NOT NULL DEFAULT 'worker' CHECK (role IN ('worker', 'admin')),
  clocks_in    INTEGER NOT NULL DEFAULT 1,      -- 0 = no clock-in screen (Sam)
  active       INTEGER NOT NULL DEFAULT 1,      -- 0 = deactivated: can't log in, hidden from the name list
  pin_hash     TEXT,                            -- NULL until a PIN is set
  pin_salt     TEXT,
  failed_pins  INTEGER NOT NULL DEFAULT 0,
  locked_until TEXT,
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL
);
CREATE UNIQUE INDEX people_name ON people (first_name COLLATE NOCASE, last_name COLLATE NOCASE);

CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,                  -- SHA-256 of the token; the token itself is only on the phone
  person_id  TEXT NOT NULL REFERENCES people (id),
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  last_seen  TEXT NOT NULL
);
CREATE INDEX sessions_person ON sessions (person_id);

-- NZCS staff (Wade, 24-11-2026). No PINs yet: they are set later.
INSERT INTO people (id, first_name, last_name, role, clocks_in, created_at, updated_at) VALUES
  (lower(hex(randomblob(16))), 'Wade', 'McSoriley', 'admin', 1, strftime('%Y-%m-%dT%H:%M:%fZ'), strftime('%Y-%m-%dT%H:%M:%fZ')),
  (lower(hex(randomblob(16))), 'Gareth', 'Coyle', 'admin', 1, strftime('%Y-%m-%dT%H:%M:%fZ'), strftime('%Y-%m-%dT%H:%M:%fZ')),
  (lower(hex(randomblob(16))), 'Toby', 'Haliday', 'admin', 1, strftime('%Y-%m-%dT%H:%M:%fZ'), strftime('%Y-%m-%dT%H:%M:%fZ')),
  (lower(hex(randomblob(16))), 'Dave', 'Burgess', 'admin', 1, strftime('%Y-%m-%dT%H:%M:%fZ'), strftime('%Y-%m-%dT%H:%M:%fZ')),
  (lower(hex(randomblob(16))), 'Sam', 'Haliday', 'admin', 0, strftime('%Y-%m-%dT%H:%M:%fZ'), strftime('%Y-%m-%dT%H:%M:%fZ')),
  (lower(hex(randomblob(16))), 'Nigel', 'Spencer', 'worker', 1, strftime('%Y-%m-%dT%H:%M:%fZ'), strftime('%Y-%m-%dT%H:%M:%fZ')),
  (lower(hex(randomblob(16))), 'Dave', 'Spedding', 'worker', 1, strftime('%Y-%m-%dT%H:%M:%fZ'), strftime('%Y-%m-%dT%H:%M:%fZ')),
  (lower(hex(randomblob(16))), 'Dave', 'Walker', 'worker', 1, strftime('%Y-%m-%dT%H:%M:%fZ'), strftime('%Y-%m-%dT%H:%M:%fZ')),
  (lower(hex(randomblob(16))), 'Rob', 'Grant', 'worker', 1, strftime('%Y-%m-%dT%H:%M:%fZ'), strftime('%Y-%m-%dT%H:%M:%fZ')),
  (lower(hex(randomblob(16))), 'Jonathan', 'Poll', 'worker', 1, strftime('%Y-%m-%dT%H:%M:%fZ'), strftime('%Y-%m-%dT%H:%M:%fZ')),
  (lower(hex(randomblob(16))), 'Ruby', 'Young', 'worker', 1, strftime('%Y-%m-%dT%H:%M:%fZ'), strftime('%Y-%m-%dT%H:%M:%fZ')),
  (lower(hex(randomblob(16))), 'Brandon', 'Muller', 'worker', 1, strftime('%Y-%m-%dT%H:%M:%fZ'), strftime('%Y-%m-%dT%H:%M:%fZ')),
  (lower(hex(randomblob(16))), 'Tad', 'Schultz', 'worker', 1, strftime('%Y-%m-%dT%H:%M:%fZ'), strftime('%Y-%m-%dT%H:%M:%fZ'));
