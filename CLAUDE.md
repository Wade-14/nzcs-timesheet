# NZCS Timesheet – project notes

Timesheet / clock-in app for NZ Conservation Services Ltd (Southland, NZ) staff. It replaces the paid clock-in app they use now. Workers clock in and out on their phones at job sites. Admins approve adjustments and leave, see who's working, and get a PDF timesheet for each worker every fortnight. **No invoicing**: the Charge Out forms already handle that.

This file records the brief and every decision the owner (Wade) makes, so work can continue in any session. **Record new decisions here as they are made, with who decided and the date (dd-mm-yyyy).**

**This repository is public.** Never commit PINs, share codes, API keys, passwords or other private values. They live only as Cloudflare secrets or in the database.

## Status

- **24-11-2026:** design stage. Repo created, these notes written.
- **24-11-2026:** Wade said go on **step 1 (logins and roles)**. Built and tested locally (Worker + app). **Not deployed yet**: the Cloudflare database and Worker still need creating, and GitHub Pages needs turning on (see "Going live" below).

## Where things are

| What | Where |
|---|---|
| Live app | https://wade-14.github.io/nzcs-timesheet/ (once GitHub Pages is on) |
| Preview (test changes here first) | https://wade-14.github.io/nzcs-timesheet/preview/ |
| API (Cloudflare Worker) | https://nzcs-timesheet-api.royal-dawn-9e17.workers.dev (once deployed) |
| Hosting | GitHub Pages from `main`, repo root |

## Files

- `index.html`: the whole app (one file, no build step). Screens: **Who are you?** (name buttons), **PIN pad**, **No PIN yet**, **First-time setup**, **Home** (Today card for people who clock in, Admin card for admins), **Manage people** list, **Add / edit person**. `API` is at the top of the script (localhost uses `http://localhost:8787`).
- `sw.js`: service worker, same approach as the forms apps (network first, `cache: "no-cache"`, offline fallback). Cache name `nzcst-vN`: **bump it on every release** in both `sw.js` and `preview/sw.js`. It only deletes its own old `nzcst-` caches, and the app asks it to re-save missing files each time it opens ("recache"), because the NZCS Forms and SFS Forms service workers currently delete every cache on wade-14.github.io when they update.
- `manifest.webmanifest`, `icon-*.png` (copied from NZCS Forms), `robots.txt`.
- `preview/`: full copy of the app for testing. Same files.
- `worker/`: Cloudflare Worker (`src/index.js`), D1 migrations (`migrations/`), `wrangler.toml`.

## Release process (same as the forms apps)

1. Edit files in `preview/`, test (see Testing), push, and let Wade try the preview if the change is big.
2. Copy the preview files to the root, bump `CACHE` in both service workers, commit and push to `main`.
3. Users get updates by fully closing and reopening the app.

## Going live (first time, not done yet)

1. Cloudflare: create D1 database `nzcs-timesheet` (Oceania), put its id in `worker/wrangler.toml`, apply migrations (`npx wrangler d1 migrations apply nzcs-timesheet --remote`), deploy the Worker. The Cloudflare token is in the session environment **"nzcs-chargeout"** (proxy-injected for api.cloudflare.com); this session must be on that environment to deploy. Deploy command: `cd worker && WRANGLER_SEND_METRICS=false CLOUDFLARE_API_TOKEN=proxy-injected CLOUDFLARE_ACCOUNT_ID=dc50d269d55490062b7b588156ed2fa1 npx wrangler deploy`.
2. Wade adds the secret **`SETUP_CODE`** himself in the Cloudflare dashboard (Worker → Settings → Variables and Secrets), so it never passes through a chat or the repo.
3. GitHub: Settings → Pages → Deploy from branch `main`, folder `/ (root)`.
4. Wade logs in once with the setup code to set his own PIN, then sets everyone else's from Manage people.

## Testing

- `cd worker`, create `.dev.vars` (gitignored) with `SETUP_CODE=<test code>` and `EXTRA_ORIGINS=http://localhost:8765`, then `npx wrangler d1 migrations apply nzcs-timesheet --local` and `npx wrangler dev --local --port 8787`.
- Serve the repo with `python3 -m http.server 8765` and drive it with Playwright (Chromium is preinstalled), phone-sized (iPhone 13 profile).
- Step 1 was checked with 26 API tests (PIN rules, lockout, setup code, admin-only routes, deactivation, can't remove own admin) and a phone-sized browser run (login, wrong PIN, offline reopen, Sam's screen, add/edit/turn off person). No errors.

## Sister apps (same owner, same setup)

- **NZCS Forms** (repo `Wade-14/nzcs-chargeout`) and **SFS Forms** (repo `Wade-14/sfs-forms`). Both are plain HTML/JS PWAs on GitHub Pages with a Cloudflare Worker + D1 database, jsPDF, an IndexedDB Outbox for offline sending, Gmail SMTP email from nzcsforms@gmail.com, and OpenStreetMap maps. Read their `CLAUDE.md` for conventions. This app follows the same patterns where they fit.
- Both forms apps and this app are served from `wade-14.github.io`, so they **share browser storage**. Use a unique prefix for everything stored on the phone (planned: `nzcst.` for localStorage keys, `nzcst-` for IndexedDB names and service worker caches).

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
- **PINs are created later.** Don't set or invent any yet. Everyone starts with "No PIN yet".
- Admins can add or deactivate workers and reset PINs.
- PINs are stored hashed by the Worker, never in the repo.

How step 1 works (built 24-11-2026; details chosen by Claude, tell Wade if any need changing):

- **PIN = exactly 4 numbers.** Entered on a big on-screen number pad; logs in automatically at the 4th number.
- **5 wrong PINs in a row locks that login for 15 minutes.** An admin setting a new PIN unlocks it straight away.
- **Phones stay logged in for a year** (so the app works offline after the first login). Logging in needs signal; after that the app opens with no signal. "Log out" on the home screen.
- **First PIN / getting the first admin in:** a person with no PIN sees "Your PIN hasn't been set up yet. Ask an admin". Below that, "First-time setup with the setup code" lets them set their own first PIN with the `SETUP_CODE` secret. It only works for someone who has no PIN yet. Wade uses it once for himself; after that admins set PINs in Manage people.
- **Manage people (admins, including Sam):** list with tags Admin / No clock-in / No PIN yet / Turned off. Add a person (first name, last name, Worker/Admin, clocks in Yes/No, optional PIN). Edit the same fields, set a new PIN. **Turn off login** (they can't log in, are logged out on every phone, disappear from the name list; records kept) and turn back on. An admin can't turn off their own login or remove their own admin access.
- Name list is sorted by first name, showing first name with surname underneath.
- Home screen says "Kia ora, <first name>". People who clock in see a Today card (placeholder until step 2); admins see an Admin card. Sam (no clock-in) sees only the Admin card.
- Database: `people` (names, role, clocks_in, active, PIN hash + salt, failed tries, lock time) and `sessions` (only a SHA-256 of each login token is stored). The 13 staff are added by `worker/migrations/0001_people.sql`. A daily cron removes expired logins.
- Phone storage keys: `nzcst.token`, `nzcst.me`.
- **For step 2:** turning off a login or a token expiring must never lose entries still waiting to sync on the phone. Keep the queue and ask them to log in again.

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

- `people` ✅ and `sessions` ✅ (built in step 1, see Logins).
- `shifts`: person, NZ date, clock-in time, clock-out time, GPS for each (or "no location" flag), jobs text, adjusted flag.
- `breaks`: shift, start, end (several per shift).
- `adjustment_requests`: shift, which time, original value, requested value, reason, status, reviewer, reviewed at.
- `leave_requests` + `leave_days`: type, date range; one row per day with hours (default 8). Status, reviewer.
- `timesheet_submissions`: person, fortnight, sent at.
- `notifications`: in-app messages (e.g. "your adjustment was approved").
- `settings`: fortnight start date, etc.

## Build order (from the brief)

1. Logins and roles (worker and admin). ✅ built 24-11-2026, not deployed yet
2. Clock in/out and breaks, with offline storage and sync. ← next
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
