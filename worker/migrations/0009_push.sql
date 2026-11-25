-- Phone alerts for admins (Wade, 25-11-2026): a notification when someone sends an adjustment request.
-- Web Push with no message body: the server "pings" each admin phone, and the app's service worker asks
-- /api/push/notices what it was about.
CREATE TABLE push_subs (
  endpoint   TEXT PRIMARY KEY,                -- the phone's push address
  person_id  TEXT NOT NULL REFERENCES people (id),
  created_at TEXT NOT NULL,
  last_fetch TEXT                             -- notices newer than this haven't been shown on this phone yet
);
CREATE TABLE notices (
  id             TEXT PRIMARY KEY,
  kind           TEXT NOT NULL,               -- 'request'
  title          TEXT NOT NULL,
  body           TEXT NOT NULL,
  url            TEXT NOT NULL,               -- where tapping it goes in the app, e.g. '#dash'
  exclude_person TEXT,                        -- the person who caused it (not alerted about their own request)
  created_at     TEXT NOT NULL
);
CREATE INDEX notices_time ON notices (created_at);
