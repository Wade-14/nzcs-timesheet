-- Step 3: "What job did you work on today and where?" One free-text answer per shift (Wade, 25-11-2026:
-- every clock-in gets its own answer, even with several shifts in a day).
ALTER TABLE shifts ADD COLUMN jobs TEXT;
ALTER TABLE shifts ADD COLUMN jobs_at TEXT;   -- phone time of the latest edit; an older edit arriving late never overwrites a newer one
