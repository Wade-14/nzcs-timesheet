-- Step 2: clock in/out and breaks. Times are UTC ISO strings as recorded by the phone at the moment of the tap.
-- IDs are made on the phone, so an entry sent twice (patchy signal) is only saved once.
CREATE TABLE shifts (
  id           TEXT PRIMARY KEY,
  person_id    TEXT NOT NULL REFERENCES people (id),
  work_date    TEXT NOT NULL,          -- NZ date the shift started (a shift past midnight counts on its start day)
  clock_in_at  TEXT NOT NULL,
  clock_out_at TEXT,                   -- NULL while clocked in
  in_lat REAL, in_lng REAL, in_acc REAL,
  in_loc       TEXT NOT NULL DEFAULT 'none',   -- ok | denied | unavailable | none
  out_lat REAL, out_lng REAL, out_acc REAL,
  out_loc      TEXT,
  created_at   TEXT NOT NULL,          -- when the server received it (compare with clock_in_at to spot late syncs)
  updated_at   TEXT NOT NULL
);
CREATE INDEX shifts_person_date ON shifts (person_id, work_date);
CREATE INDEX shifts_open ON shifts (clock_out_at) WHERE clock_out_at IS NULL;

CREATE TABLE breaks (
  id         TEXT PRIMARY KEY,
  shift_id   TEXT NOT NULL REFERENCES shifts (id),
  start_at   TEXT NOT NULL,
  end_at     TEXT,                     -- NULL while on break
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX breaks_shift ON breaks (shift_id);
