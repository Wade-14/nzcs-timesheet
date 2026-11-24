-- Step 4: when each person's phone last sent anything (shown on the admin dashboard).
ALTER TABLE people ADD COLUMN last_sync_at TEXT;
