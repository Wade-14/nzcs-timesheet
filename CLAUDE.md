# NZCS Timesheet – project notes

Timesheet / clock-in app for NZ Conservation Services Ltd (Southland, NZ) staff. It replaces the paid clock-in app they use now. Workers clock in and out on their phones at job sites. Admins approve adjustments and leave, see who's working, and get a PDF timesheet for each worker every fortnight. **No invoicing**: the Charge Out forms already handle that.

This file records the brief and every decision the owner (Wade) makes, so work can continue in any session. **Record new decisions here as they are made, with who decided and the date (dd-mm-yyyy).**

**This repository is public.** Never commit PINs, share codes, API keys, passwords or other private values. They live only as Cloudflare secrets or in the database.

## Status

- **24-11-2026:** design stage. Repo created, these notes written. No app code yet. Wade said "we're just designing for the moment"; build step 1 only when he says go.

## Sister apps (same owner, same setup)

- **NZCS Forms** (repo `Wade-14/nzcs-chargeout`) and **SFS Forms** (repo `Wade-14/sfs-forms`). Both are plain HTML/JS PWAs on GitHub Pages with a Cloudflare Worker + D1 database, jsPDF, an IndexedDB Outbox for offline sending, Gmail SMTP email from nzcsforms@gmail.com, and OpenStreetMap maps. Read their `CLAUDE.md` for conventions. This app follows the same patterns where they fit.
- Both forms apps and this app are served from `wade-14.github.io`, so they **share browser storage**. Use a unique prefix for everything stored on the phone (planned: `nzcst.` for localStorage keys, `nzcst-` for IndexedDB names and service worker caches).
- **Cache Storage is shared too (24-11-2026):** this app's service worker must only delete its own old caches (`nzcst-vN` live, `nzcst-preview-vN` preview, matched by `CACHE` minus its version number), never "every cache except the current one". The forms apps did that and wiped each other's offline copies; fixed in both forms repos on 24-11-2026.

## Tech stack (decided 24-11-2026)

Matches the forms apps (Wade agreed). Supabase/Firebase were considered and dropped in favour of the existing Cloudflare setup: one system to look after, at $0 a month.

| Part | Choice |
|---|---|
| App | Plain HTML/JS PWA, hosted on **GitHub Pages** from `main`. Live app at the repo root plus a full **`preview/`** copy for testing first (same release process as the forms apps) |
| Server | Its own **Cloudflare Worker** + **D1 database** on Wade's Cloudflare account (free plan). Kept separate from the NZCS Forms Worker/database, the way SFS Forms is |
| Offline | Offline-first. Every tap is saved on the phone (IndexedDB) straight away, with a client-made ID and the phone's own timestamp, then synced when there's signal. Re-sending is harmless (no duplicates) |
| Live dashboard | Refreshes about every 30 seconds (no realtime service needed) |
| PDF | jsPDF + AutoTable, made in the browser, like the forms apps |
| Email ("Send my fortnight") | Through the Worker from nzcsforms@gmail.com, like the forms apps |
| Maps | Leaflet-style pins on OpenStreetMap, like the forms apps |

## People and roles (decided 24-11-2026)

Every person has their **own login**. This is different from the forms apps, which use a shared code.

| Person | Clocks in | Admin |
|---|---|---|
| Wade McSoriley (owner) | Yes | Yes |
| Gareth Coyle | Yes | Yes |
| Toby Haliday | Yes | Yes |
| Dave Burgess | Yes | Yes |
| Sam Haliday (payroll/admin) | **No** | Yes. View and download every worker's fortnight PDF, approvals. No clock-in screen |
| Nigel Spencer | Yes | No |
| Dave Spedding | Yes | No |
| Dave Walker | Yes | No |
| Rob Grant | Yes | No |
| Jonathan Poll | Yes | No |
| Ruby Young | Yes | No |
| Brandon Muller | Yes | No |
| Tad Schultz | Yes | No |

- NZCS staff only (not Southland Forest Services).
- Spelling is "Haliday" (as in the forms apps).
- Admins can do everything a worker can (if they clock in), plus the dashboard, approvals, PDF downloads for any worker, and managing workers.

## Logins (decided 24-11-2026)

- Log in by **tapping your first and last name, then entering a PIN** (quick with gloves on, no email needed).
- **PINs are created later.** Don't set or invent any yet.
- Admins can add or deactivate workers and reset PINs.
- PINs are stored hashed by the Worker, never in the repo.

## Features (from the brief)

### 1. Clocking
- Big, simple buttons: **Clock In, Start Break, End Break, Clock Out**. Each tap records date and time.
- A day can have more than one break.
- Total hours = time on site minus breaks.
- **Breaks (Wade, 24-11-2026):** only Start Break / End Break. **No** rest vs meal break split and no paid/unpaid break rules: "the workers can figure out the rest". All break time is deducted, as the brief says.
- Worker home screen shows today's status at a glance (e.g. "Clocked in since 7:02am", "On break").

### 1a. Clock-in and clock-out location
- GPS recorded automatically on Clock In and Clock Out only, with no extra step. Not tracked all day; no background location.
- Location permission is asked once ("while using the app"). Workers are told at setup that location is only recorded at clock in/out.
- Admins see locations as pins on an OpenStreetMap map (like the forms apps).
- No signal: location is saved on the phone and synced with the entry.
- Location unavailable or denied: the clock-in still saves, flagged **"no location"** for admins.
- Location is **not** on the fortnightly PDF.

### 2. Job recording
- Free-text box: what they worked on and where, that day. No dropdown.
- **Required**: can't clock out or finish the day until it's filled in.
- Can list several jobs/sites. Not linked to invoicing.

### 3. Time adjustments
- Workers can't change recorded times directly. They submit an adjustment request: corrected time + reason.
- An admin approves or declines; the worker is notified.
- Original and adjusted times are both kept (audit trail).

### 4. Leave
- Types: **Sick, Annual, Bereavement**.
- One day or a date range. Each day defaults to **8 hours**, editable for part days.
- A day can have both worked hours and leave (e.g. 4 h worked + 4 h sick).
- Needs admin approval.

### 5. Admin dashboard
- Live view: who is clocked in now and who is on a break.
- Each worker's daily hours, breaks, jobs and leave.
- Adjustment and leave requests waiting for approval.
- Map (OpenStreetMap) of where each worker clocked in and out.
- Manage workers (add, deactivate, reset PIN).

### 6. Fortnightly timesheet PDF
- One PDF per worker per fortnight: each day's clock in/out, breaks, total hours and jobs; leave by type and hours; approved adjustments marked as adjusted; fortnight totals (hours worked + hours of each leave type).
- Workers have a **"Send my fortnight"** button that sends the PDF to the admin/payroll person (Sam).
- Admins (including Sam) can download any worker's PDF for any fortnight.
- **Fortnight start date:** a setting. Wade (24-11-2026): not decided yet, set it later.

### Offline (required)
- Clocking, breaks, jobs, leave requests and adjustment requests save on the phone immediately and sync automatically when signal returns.
- Clear sync status, e.g. "3 entries waiting to sync".
- Approvals and the live dashboard need a connection; they update once a worker's phone has synced.

### Design
- Very simple. Usable with gloves on, outdoors, in bright sunlight: large buttons, high contrast.
- NZ date format (dd-mm-yyyy), NZ timezone (Pacific/Auckland), NZ English.

## Planned database (D1, draft)

- `people`: name, role (worker/admin), clocks_in (no for Sam), active, PIN hash.
- `shifts`: person, NZ date, clock-in time, clock-out time, GPS for each (or "no location" flag), jobs text, adjusted flag.
- `breaks`: shift, start, end (several per shift).
- `adjustment_requests`: shift, which time, original value, requested value, reason, status, reviewer, reviewed at.
- `leave_requests` + `leave_days`: type, date range; one row per day with hours (default 8). Status, reviewer.
- `timesheet_submissions`: person, fortnight, sent at.
- `notifications`: in-app messages (e.g. "your adjustment was approved").
- `settings`: fortnight start date, etc.

## Build order (from the brief)

1. Logins and roles (worker and admin). ← next, when Wade says go
2. Clock in/out and breaks, with offline storage and sync.
3. Job recording.
4. Admin dashboard (live status and daily hours).
5. Adjustment requests and approvals.
6. Leave requests and approvals.
7. Fortnightly PDF and sending it.
8. Test with a few staff, then roll out to everyone.

## Open questions (to ask when we reach that step)

- More than one shift per day (clock out and back in), or shifts past midnight?
- Forgot to clock in entirely: can a worker request a whole missing shift through an adjustment?
- When is a time "approved"? Suggested: every tap is locked once recorded; any change goes through an adjustment request.
- "Send my fortnight": email to Sam, in-app, or both?
- Fortnight start date.

## Working rules

- Ask Wade before adding fields or features he didn't ask for.
- Record each decision in this file in the same commit as the change.
