-- Step 3: "What job did you work on today and where?" One free-text answer per person per NZ day
-- (the day a shift started, so a night shift's jobs go on its start day).
CREATE TABLE day_jobs (
  person_id  TEXT NOT NULL REFERENCES people (id),
  work_date  TEXT NOT NULL,
  jobs       TEXT NOT NULL,
  jobs_at    TEXT NOT NULL,          -- phone time of the latest edit; an older edit arriving late never overwrites a newer one
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (person_id, work_date)
);
