-- Step 6: leave records (Sick, Annual, Bereavement). NOT a request: staff arrange leave with their manager by phone/text,
-- then record it here so it's on their timesheet for payroll (Wade, 25-11-2026). No approval step.
-- One entry covers a day or a date range; each day has its own hours (default 8, changed for part days).
CREATE TABLE leave_entries (
  id         TEXT PRIMARY KEY,                 -- made on the phone
  person_id  TEXT NOT NULL REFERENCES people (id),
  leave_type TEXT NOT NULL CHECK (leave_type IN ('sick', 'annual', 'bereavement')),
  start_date TEXT NOT NULL,
  end_date   TEXT NOT NULL,
  note       TEXT,
  entered_at TEXT NOT NULL,                    -- phone time when they saved it
  created_at TEXT NOT NULL,                    -- when the server received it
  removed_at TEXT                              -- set if the person removed it (kept, not deleted)
);
CREATE INDEX leave_person ON leave_entries (person_id, start_date);

CREATE TABLE leave_days (
  entry_id  TEXT NOT NULL REFERENCES leave_entries (id),
  work_date TEXT NOT NULL,
  hours     REAL NOT NULL,
  PRIMARY KEY (entry_id, work_date)
);
CREATE INDEX leave_days_date ON leave_days (work_date);
