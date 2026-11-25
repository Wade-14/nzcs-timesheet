-- Admins can edit and delete anyone's leave (Wade, 25-11-2026). Record who did it.
ALTER TABLE leave_entries ADD COLUMN updated_at TEXT;
ALTER TABLE leave_entries ADD COLUMN updated_by TEXT REFERENCES people (id);
ALTER TABLE leave_entries ADD COLUMN removed_by TEXT REFERENCES people (id);
