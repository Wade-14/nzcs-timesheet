-- Step 5: adjustment requests. A worker asks to fix a shift's times (or add a whole missed day); an admin approves or declines.
-- Nothing is ever deleted: the request keeps a copy of the shift as it was ("original") and what was asked for ("requested").
CREATE TABLE adjustments (
  id           TEXT PRIMARY KEY,               -- made on the phone (a missed day's new shift gets this id too)
  person_id    TEXT NOT NULL REFERENCES people (id),
  kind         TEXT NOT NULL CHECK (kind IN ('shift', 'day')),   -- fix an existing shift | add a missed day
  shift_id     TEXT,                           -- the shift being fixed (or, once approved, the shift a missed day created)
  work_date    TEXT NOT NULL,
  original     TEXT,                           -- JSON: the shift and its breaks when the request reached the server
  requested    TEXT NOT NULL,                  -- JSON: {start, end, breaks, jobs}; null fields mean "no change"
  reason       TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'declined')),
  requested_at TEXT NOT NULL,                  -- phone time when they sent it
  created_at   TEXT NOT NULL,
  reviewed_by  TEXT REFERENCES people (id),
  reviewed_at  TEXT,
  review_note  TEXT,
  seen_at      TEXT                            -- when the worker tapped OK on the outcome
);
CREATE INDEX adjustments_status ON adjustments (status);
CREATE INDEX adjustments_person ON adjustments (person_id, created_at);
CREATE INDEX adjustments_shift ON adjustments (shift_id);

ALTER TABLE shifts ADD COLUMN adjusted INTEGER NOT NULL DEFAULT 0;   -- 1 = times changed by an approved request
