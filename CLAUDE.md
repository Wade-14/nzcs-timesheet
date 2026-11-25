# NZCS Timesheet – project notes

Timesheet / clock-in app for NZ Conservation Services Ltd (Southland, NZ) staff. It replaces the paid clock-in app they use now. Workers clock in and out on their phones at job sites. Admins approve adjustments and leave, see who's working, and get a PDF timesheet for each worker every fortnight. **No invoicing**: the Charge Out forms already handle that.

This file records the brief and every decision the owner (Wade) makes, so work can continue in any session. **Record new decisions here as they are made, with who decided and the date (dd-mm-yyyy).**

**This repository is public.** Never commit PINs, share codes, API keys, passwords or other private values. They live only as Cloudflare secrets or in the database.

## Status

- **24-11-2026:** design stage. Repo created, these notes written.
- **24-11-2026:** Wade said go on **step 1 (logins and roles)**. Built and tested locally (Worker + app). **Not deployed yet**: the Cloudflare database and Worker still need creating, and GitHub Pages needs turning on (see "Going live" below).
- **24-11-2026:** Wade said carry on to **step 2 (clocking + offline sync)** before going live. Built and tested locally. Still not deployed.
- **25-11-2026:** Wade said go on **step 3 (job recording)**. Built and tested locally. Still not deployed.
- **25-11-2026:** Wade changed step 3 to one jobs answer **per shift**, then said move on to **step 4 (admin dashboard)**. Both built and tested locally. Still not deployed.
- **25-11-2026:** Wade asked for a live version to install on his phone. **Cloudflare done by Claude:** D1 database `nzcs-timesheet` created (Oceania, id in `wrangler.toml`), migrations 0001–0004 applied (13 people, 5 admins, no PINs), Worker deployed and answering at the API address (checked health, names, CORS for wade-14.github.io). **Waiting on Wade:** add the `SETUP_CODE` secret, turn on GitHub Pages (Claude can't: the session's GitHub proxy blocks the Pages API).
- **25-11-2026:** Wade said proceed with **step 5 (adjustments)** and answered the open question (below). Built, tested, migration 0005 applied to the live database, Worker redeployed, app released (cache `nzcst-v2`).
- **25-11-2026:** Wade turned on GitHub Pages, added `SETUP_CODE` (as a Cloudflare secret) and set his PIN with it. **The app is live and in use.** Other people's PINs are set by admins in Manage people. Wade then decided: admins **can** approve their own requests, and the app keeps **following the phone's dark mode** (see below).
- **25-11-2026:** Wade chose to change the **dashboard** before step 6: "Clocked in now" list + **View employees** → tap a name → that person's clocking history. Built, tested, migration 0006 applied live, Worker redeployed, app released (cache `nzcst-v3`). Step 6 (leave) is next.
- **25-11-2026:** Wade said go on **step 6 (leave)**, then changed it mid-build: leave is a **record, not a request** (see "4. Leave"). Built, tested, migration 0007 applied live, Worker redeployed, app released (cache `nzcst-v4`). Step 7 (fortnightly PDF) is next.
- **25-11-2026:** Wade set the fortnight start (**30-11-2026**, checked on the live database), asked for admins to edit/delete anyone's leave, and specified step 7 (download, not send). Built, tested, migration 0008 applied live, Worker redeployed, app released (cache `nzcst-v5`). Next: step 8 (try with a few staff, then everyone).
- **25-11-2026:** **Staff guide** written (Claude Doc, see Files) with screenshots, for Wade to hand out. Wade starts demoing next week (possibly with one other person), then rolls out. Night-shift check (Wade's question): fixed the "forgot to clock out?" warning so it only shows after 16 hours (cache `nzcst-v6`).
- **25-11-2026:** Wade asked for a **Share the app** button on the home screen and **phone alerts for admins** when a request comes in (it didn't notify before: admins only saw the "N to approve" badge). Both built, tested, migration 0009 applied live, `VAPID_PRIVATE_JWK` secret set by Claude (key made locally, never shown or committed), Worker redeployed, app released (cache `nzcst-v7`), staff guide updated.

- **25-11-2026:** Storage settled: records kept 7 years, alert messages 7 days, monthly Cloudflare storage check scheduled. **Build finished. Now in trial (step 8):** Wade demos it from the week of 30-11-2026 (possibly with one other person), then rolls it out to everyone. Changes from here are fixes and tweaks from the trial.

## Where things are

| What | Where |
|---|---|
| Live app | https://wade-14.github.io/nzcs-timesheet/ (live since 25-11-2026) |
| Preview (test changes here first) | https://wade-14.github.io/nzcs-timesheet/preview/ |
| API (Cloudflare Worker) | https://nzcs-timesheet-api.royal-dawn-9e17.workers.dev (deployed 25-11-2026) |
| Hosting | GitHub Pages from `main`, repo root |

## Files

- `index.html`: the whole app (one file, no build step). Screens: **Who are you?** (name buttons), **PIN pad**, **No PIN yet**, **First-time setup**, **Home** (Today card for people who clock in, Admin card for admins), **My shifts** and **Fix a shift / Missed day**, **Dashboard**, **Employees**, **Employee history**, **Settings**, **Manage people** list, **Add / edit person**. `API` is at the top of the script (localhost uses `http://localhost:8787`).
- `sw.js`: service worker, same approach as the forms apps (network first, `cache: "no-cache"`, offline fallback). Cache name `nzcst-vN`: **bump it on every release** in both `sw.js` and `preview/sw.js`. It only deletes its own old `nzcst-` caches, and the app asks it to re-save missing files each time it opens ("recache"), because the NZCS Forms and SFS Forms service workers currently delete every cache on wade-14.github.io when they update.
- `vendor/jspdf.umd.min.js`, `vendor/jspdf.plugin.autotable.min.js`, `vendor/logo.js` (`window.NZCS_LOGO`): copied from NZCS Forms for the fortnight PDF; loaded only when a PDF is made.
- `vendor/leaflet/`: Leaflet 1.9.4 (`leaflet.js`, `leaflet.css`, `LICENSE`; local copy, source-map line removed). Loaded only when an admin opens the dashboard.
- `manifest.webmanifest`, `icon-*.png` (copied from NZCS Forms), `robots.txt`.
- **Staff guide:** Claude Doc **"NZCS Timesheet – Staff Guide"** https://claude.ai/artifact/UDNcnh9HG6rrhmfKfKusP2 (sections: what it's for, install on iPhone/Android, logging in, your day, no signal, fixing times / missed day, leave, fortnight PDF + email, for admins, rules + troubleshooting). Screenshots in `docs/guide-images/` (taken from a local test copy with sample data, light theme). **When a change affects anything staff see or do, update the guide in the same piece of work and tell Wade** (offer to update the doc; retake the screenshot if a screen changed).
- `preview/`: full copy of the app for testing. Same files.
- `worker/`: Cloudflare Worker (`src/index.js`), D1 migrations (`migrations/`), `wrangler.toml`.

## Storage (Wade asked, 25-11-2026)

- **Everything is stored in the Cloudflare D1 database `nzcs-timesheet`** (Oceania) on Wade's account: people, logins, shifts, breaks, jobs text, locations, requests, leave, settings, alert sign-ups. Phones only keep a working copy (last 14 days + anything waiting to sync) so the app works offline; losing a phone loses only entries that never synced.
- **PDFs are not stored anywhere**: made on the phone when downloaded, then emailed by the person.
- Size on 25-11-2026: 139 KB (empty: just the tables). Estimate ~1 KB per person per working day (shift + breaks + jobs + indexes), so 12 workers ≈ 3–5 MB a year. D1 free plan: 500 MB per database (5 GB across the account; NZCS Forms 471 KB, SFS Forms 33 KB), 100,000 row writes and 5 million row reads a day. Normal use is a few hundred writes a day; the 30-second dashboard refresh reads a small number of indexed rows. Records are kept for **7 years** (see Automatic deletion below), so the database stops growing after that.
- **Monthly storage check (Wade, 25-11-2026):** a scheduled task "Monthly Cloudflare storage check (NZCS apps)" (id `trig_01FaXekb6XGFjnRRURoAZ1s6`) runs on the **1st of each month at 10:43am NZ** in a fresh session on the "nzcs-chargeout" environment. Read-only: `wrangler d1 list` + `d1 info` for nzcs-timesheet, nzcs-chargeout and sfs-forms; reports size vs 500 MB / 5 GB and yesterday's rows read/written; warns Wade (phone notification) when any database passes 250 MB, the total 2.5 GB, or daily rows pass half the limits, so he can export and save the data. Wade chose a check rather than automatic backups ("if we're getting to a point where we need to extract all the data, let me know").
- **Automatic deletion (Wade, 25-11-2026): keep timesheet records for 7 years, then delete them; keep alert messages for 7 days.** The daily cron (~3am NZ, `tidyUp()` in `worker/src/index.js`, `KEEP_YEARS` / `NOTICE_DAYS`) deletes shifts whose NZ day is more than 7 years ago (cut-off = today's date 7 years back) with their breaks and any adjustment requests about them, leave days older than that (an entry is deleted once none of its days are left), alert notices older than 7 days, and expired logins. People, settings and alert sign-ups are never auto-deleted. Wade first asked whether the "alert messages" were the adjustment requests: they're not, only the text behind the phone notification; the requests themselves follow the 7-year rule. Tested locally with 2018/2019/2026 records and 3- and 8-day-old alerts (all kept/deleted as expected). NZCS Forms is separate: it removes finished Charge Out jobs and completed incidents after 365 days.
- Cloudflare's D1 Time Travel can restore the database to an earlier point (about the last 7 days on the free plan). For a longer backup, export it (`npx wrangler d1 export nzcs-timesheet --remote --output=<file>.sql`).

## Release process (same as the forms apps)

1. Edit files in `preview/`, test (see Testing), push, and let Wade try the preview if the change is big.
2. Copy the preview files to the root, bump `CACHE` in both service workers, commit and push to `main`.
3. Users get updates by fully closing and reopening the app.

## Going live (first time)

1. ✅ (25-11-2026) Cloudflare: create D1 database `nzcs-timesheet` (Oceania), put its id in `worker/wrangler.toml`, apply migrations (`npx wrangler d1 migrations apply nzcs-timesheet --remote`), deploy the Worker. The Cloudflare token is in the session environment **"nzcs-chargeout"** (proxy-injected for api.cloudflare.com); this session must be on that environment to deploy (it also allows the timesheet Worker's host, added 25-11-2026, so sessions can test the live API). New migrations: `npx wrangler d1 migrations apply nzcs-timesheet --remote` before deploying. Deploy command: `cd worker && WRANGLER_SEND_METRICS=false CLOUDFLARE_API_TOKEN=proxy-injected CLOUDFLARE_ACCOUNT_ID=dc50d269d55490062b7b588156ed2fa1 npx wrangler deploy`.
2. ✅ (25-11-2026) Wade adds the secret **`SETUP_CODE`** himself in the Cloudflare dashboard (Worker → Settings → Variables and Secrets), so it never passes through a chat or the repo.
3. ✅ (25-11-2026) GitHub: Settings → Pages → Deploy from branch `main`, folder `/ (root)`.
4. ✅ (25-11-2026) Wade logs in once with the setup code to set his own PIN, then sets everyone else's from Manage people.

## Testing

- `cd worker`, create `.dev.vars` (gitignored) with `SETUP_CODE=<test code>` and `EXTRA_ORIGINS=http://localhost:8765`, then `npx wrangler d1 migrations apply nzcs-timesheet --local` and `npx wrangler dev --local --port 8787`.
- Serve the repo with `python3 -m http.server 8765` and drive it with Playwright (Chromium is preinstalled), phone-sized (iPhone 13 profile).
- Step 1 was checked with 26 API tests (PIN rules, lockout, setup code, admin-only routes, deactivation, can't remove own admin) and a phone-sized browser run (login, wrong PIN, offline reopen, Sam's screen, add/edit/turn off person). No errors.
- Step 2 was checked with 14 API tests (night shift past midnight, re-sent taps not duplicated, two shifts in a day, open break closed at clock-out, location stored / denied flagged, can't touch someone else's shift, Sam can't clock in) and a phone-sized browser run: location explanation, clock in, then **with no signal** break, end break, double-tapped Clock Out (saved once), second clock-in, close and reopen the app, log-out warning; signal back → everything synced with GPS. Also a second person on the same phone with location denied (saved, flagged). No errors.
- Step 3 was checked with 5 API tests (two shifts each with their own text, newest edit wins even if an older one arrives later, can't write on someone else's shift, 2000-character limit) and a phone-sized browser run: box hidden before clock-in, Wade's wording, Clock Out blocked when empty or only spaces, then **with no signal** typed and clocked out straight away, edited again (still one queued entry), reopened the app (text kept), clocked in again (new empty box, "For your shift from…", first answer shown in the list, Clock Out blocked until filled); signal back → server had both shifts with their own text. Steps 1–2 tests still pass. No errors.
- Step 4 was checked with 8 API tests (workers get 403, Sam can read it, Sam isn't listed as a worker, open break, shift left open from yesterday shows as open but in yesterday's hours, last sync time, never-synced phone) and a phone-sized browser run as Sam with a sample day: summary counts, on-site first, "forgot to clock out?" flag, hours/breaks/jobs per shift, missing jobs and location-off flags, 4 map pins + "No location recorded" list, Show on map, previous day / Back to today / can't go past today; a worker going to `#dash` stays on Home. Map tiles were mocked (no internet in the test browser). No errors.
- Step 5 was checked with 25 API tests (save, re-send harmless, finish before start / break outside / overlapping / missing finish / no reason / someone else's shift rejected, missed day needs job, open shift start-only, workers can't list, oldest first, original kept, approve updates shift, can't decide twice, missed day becomes a shift on the right date, decline changes nothing, worker sees outcome + note + who, seen, dashboard shows original) and a two-phone browser run: Ruby fixes yesterday's finish + adds a break (form checks, live totals), then adds a missed day **with no signal** (Waiting to sync → synced); Sam sees "2 to approve", Now vs Asked for, approves one with a note and declines the other; dashboard shows Adjusted / was / approved by; Ruby gets both outcome boxes, OK clears them (stays cleared), her shift shows Adjusted with the new times. No errors.
- Dashboard redesign was checked with 5 API tests (default fortnight start, workers can't change settings or read someone's history, Sam can, max range) and a phone-sized browser run as Sam: Clocked in now shows only the 3 people on site/on break, day view gone, today's map (4 pins), tapping a name opens their history, View employees lists the 12 who clock in, Nigel's fortnight (clocked in now, "not set yet" note, can't go forward, previous fortnight totals, Back to this fortnight), Settings saved → fortnights start on the new day. Fixed two bugs found while testing: the history map didn't re-zoom when switching person, and the previous person's details showed briefly while the next loaded. No errors.
- Step 6 was checked with 15 API tests (record, re-send harmless, bad type / no days / 0 or 25 hours / same day twice rejected, Sam can't, not in approvals, worker's list, straight onto the fortnight history, can't remove someone else's, remove own → gone from history and list) plus the 25 step-5 tests again, and a two-phone browser run: Ruby records Thu 8h + Fri 4h sick leave **with no signal** (type required, 12h total, Waiting to sync → On your timesheet, days show Sick leave), records annual by mistake and removes it; Sam has nothing to approve and sees Thu/Fri sick leave and "Sick leave 12h" on Ruby's fortnight. Found and fixed: on a narrow phone the leave form (and the fix-a-shift time boxes) spilled off the right edge. No errors.
- Step 7 was checked with 13 API tests (fortnight start saved, workers can't open/edit others' leave, admin opens/edits/deletes leave, bad edit refused, worker's list shows the admin's change, own-fortnight data, too-long range refused) and a two-phone browser run: Nigel downloads his fortnight (file name, email prompt mailto to admin@nzconservation.nz, PDF text checked with pdftotext: heading, open shift flagged, adjusted shift marked, totals, empty days, no location), Last fortnight dates; Sam edits Ruby's leave (type + hours) and deletes it, downloads Nigel's and Ruby's PDFs (sick leave rows and 12h total). No errors.
- The test scripts aren't in the repo. Note: a scripted Clock Out now needs the jobs box filled in first.

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
- Phone storage keys: `nzcst.token`, `nzcst.me`, `nzcst.locInfoSeen`; IndexedDB `nzcst-data` (stores `queue` and `shifts`).
- **For step 2:** turning off a login or a token expiring must never lose entries still waiting to sync on the phone. Keep the queue and ask them to log in again.

## Features (from the brief)

### 1. Clocking
- Big, simple buttons: **Clock In, Start Break, End Break, Clock Out**. Each tap records date and time.
- A day can have more than one break.
- Total hours = time on site minus breaks.
- **Breaks (Wade, 24-11-2026):** only Start Break / End Break. **No** rest vs meal break split and no paid/unpaid break rules: "the workers can figure out the rest". All break time is deducted, as the brief says.
- Worker home screen shows today's status at a glance (e.g. "Clocked in since 7:02am", "On break").
- **More than one shift a day is allowed (Wade, 24-11-2026):** clock out and clock back in later the same day. Each is its own shift; the day's total adds them up.
- **No undo and no "are you sure?" (Wade, 24-11-2026):** every tap saves straight away. Mistakes are fixed through an adjustment request (step 5). (Claude had suggested a 2-minute undo; Wade chose neither.) A fast double tap is still only saved once.
- **Shifts past midnight (Wade, 24-11-2026: crews sometimes work past midnight, e.g. night shooting):** a shift counts on the NZ date it **started**.
- **Night shifts stay one shift (Wade, 25-11-2026):** e.g. clock in 7pm on the 25th, clock out 2am on the 26th = one clocking, on the 25th, finish shown "2:00am (next day)". The "forgot to clock out?" warnings (worker home amber note, dashboard amber "On site") only appear once someone has been clocked in **more than 16 hours** (`STALE_MS` in index.html), not just because the date changed. Checked with a simulated phone clock at 2am (no warning) and 17 h later (warning).

How step 2 works (built 24-11-2026):

- Home screen (people who clock in): sync line, then the **Today** card: day and date, big status ("Not clocked in" / "Clocked in since 7:02am" / "On break since 10:15am" / "Clocked out at 4:30pm"), then **only the buttons that make sense**: Not clocked in → **Clock In**. Clocked in → **Start Break** (orange) and **Clock Out**. On break → **End Break** and a smaller **Clock Out**. Below: Worked today and Breaks totals (count up live) and a list of today's shifts with their breaks.
- Clocking out while on a break ends the break at the clock-out time.
- Still clocked in **more than 16 hours** (see night shifts above): amber note "You've been clocked in since <day> at <time>. If you forgot to clock out, clock out now and ask an admin to fix the time." The shift stays on its start day.
- **Location:** before a person's first Clock In on a phone, a box explains that location is recorded only at Clock In and Clock Out and to choose "Allow while using the app" (then "OK, clock me in"). The tap's time is saved instantly; GPS is added when it arrives (waits up to 20 s). Denied or no fix → saved as `denied` / `unavailable` and the shift shows "Location not recorded" (admins see it as "no location" in step 4).
- **Offline:** every tap is saved on the phone first (IndexedDB queue, in tap order, tagged with the person) and sent to `POST /api/sync`. IDs are made on the phone, so a tap sent twice is only saved once. Sync runs after each tap, when signal returns, when the app comes to the front, and every minute. The sync line says "✓ All synced" or "N entries waiting to sync (no signal)" with **Try now**. If the server rejects an entry it stays on the phone and the line turns red with the reason.
- Times are the **phone's time at the tap**, not the sync time. The server also stores when it received each shift (`created_at`) so late or odd syncs can be spotted.
- Logging out with entries waiting warns "N entries haven't synced yet…"; they stay on the phone and sync when that person logs back in there. A different person logging in on the same phone never sends or sees them.
- When nothing is waiting, the phone's copy is refreshed from the server (`GET /api/my/shifts`, last 7 days plus any open shift), so using two phones stays consistent.
- Sam (clocks in: No) can't sync (403) and has no Today card.
- The jobs box (step 3) sits under the buttons; see "2. Job recording".

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
- **Wording (Wade, 25-11-2026):** the box asks **"What job did you work on today and where?"**

- **One answer per shift (Wade, 25-11-2026):** "Each clocking, I want it to come up for them to fill out what they've been doing." Every clock-in gets its own box, even with several shifts in a day, and each shift needs its own answer before it can be clocked out. (Claude first built one answer per day; Wade changed it the same day, before anything was deployed.)

How step 3 works (built 25-11-2026; details chosen by Claude, tell Wade if any need changing):

- The box appears on the Today card under the buttons as soon as they clock in, empty for each new shift. Hint under it: "You can list more than one job or place. Fill this in for each shift before you clock out." Plain box, no dropdown, up to 2000 characters.
- When there's more than one shift today (or the shift started on an earlier day), a line above the box says which shift it's for, e.g. "For your shift from 1:00pm".
- After clocking out, the box stays showing that shift's answer (still editable) until they clock in again. Earlier shifts' answers are shown under each shift in today's list.
- **Clock Out with the box empty (or only spaces):** nothing is saved, the box turns red, the cursor goes into it, and it says "Fill in what job you worked on today and where, then tap Clock Out."
- Saved on the phone as they type (shortly after they stop, when they leave the box, or before any button tap), then synced like a tap. Only the latest text for a shift is kept in the queue. On the server the newest edit (by phone time) always wins, even if an older edit arrives later.
- Shifts from earlier days can't be edited from the home screen (changes later go through admins / adjustments).
- Database: `shifts.jobs` + `shifts.jobs_at` (`worker/migrations/0003_shift_jobs.sql`). `GET /api/my/shifts` returns `jobs` on each shift. Sync entry type `jobs` with `shift_id`.

### 3. Time adjustments
- Workers can't change recorded times directly. They submit an adjustment request: corrected time + reason.
- An admin approves or declines; the worker is notified.
- Original and adjusted times are both kept (audit trail).
- **Forgot to clock in (Wade, 25-11-2026):** they clock in later in the day, then send an adjustment for the start time.
- **Missed a whole day (Wade, 25-11-2026):** a "missed day" request with start, finish, breaks, where they were working (the job box) and a reason.

How step 5 works (built 25-11-2026; details chosen by Claude, tell Wade if any need changing):

- Home (people who clock in): button under the Today card **"My shifts · fix a time · add a missed day"** → `#mine`: **+ Add a missed day**, **My requests** (Waiting to sync / Waiting for approval / Approved / Declined, with reason and any admin note), and the **last 14 days** of shifts by day (totals, breaks, jobs, "Adjusted" tag), each with **Ask to fix this shift** (replaced by "Fix requested, waiting for approval" while one is pending: one pending request per shift).
- **Fix a shift** (`#fix-<id>`): starts with the shift's current start, finish, breaks (add / ✕ remove) and job text, plus a required **Reason for the change**. Live Worked / Breaks totals. A finish (or break) time earlier than the start counts as the next day. Checks: finish after start, max 24 h, nothing in the future, breaks inside the shift and not overlapping, job filled in, something actually changed. **Still clocked in:** only the start time can be fixed (clock out as normal on Home).
- **Missed day** (`#missed`): date (not in the future), start, finish, breaks, job/where, reason; all required except breaks.
- Requests save on the phone and sync like taps (queue type `adjust`), so they work with no signal.
- **Admins (including Sam):** Home's Dashboard button shows "N to approve", and admins who turned on **Phone alerts** get a notification (see "Phone alerts for admins"). The dashboard's top card **Waiting for approval** lists them oldest first: name, Fix a shift / Missed day, date, when sent, a **Now vs Asked for** table (start, finish, breaks, worked hours, job; changes in bold green), reason, optional note, **Approve** / **Decline**. Any admin can decide any request, **including their own (Wade, 25-11-2026: "let admins still fix their own days")**.
- **Approve** changes the shift (start, finish, breaks replaced, job) and marks it **Adjusted**; a missed day becomes a new shift (no location; not flagged as "no location"). **Decline** changes nothing. Either way the request keeps the original and the requested values forever (audit trail). The dashboard's day view shows adjusted shifts as "Adjusted · approved by <name>", "Was <times>. Reason: …".
- **Worker notified:** green "✓ Approved" / red "✗ Declined" box on Home (who decided, any note) until they tap OK.
- Database: `adjustments` (kind shift|day, original + requested JSON, reason, status, reviewer, note, seen) and `shifts.adjusted` (`worker/migrations/0005_adjustments.sql`). API: sync type `adjust`; `GET /api/my/requests`, `POST /api/my/requests/<id>/seen`; `GET /api/admin/requests` (pending; `?status=recent` for the last 30 days decided), `POST /api/admin/requests/<id>` {decision: approve|decline, note}. The phone now keeps 14 days of shifts. Phone storage adds `nzcst.reqs.<person>` and `nzcst.seenReqs`.

### 4. Leave
- Types: **Sick, Annual, Bereavement**.
- One day or a date range. Each day defaults to **8 hours**, editable for part days.
- A day can have both worked hours and leave (e.g. 4 h worked + 4 h sick).
- ~~Needs admin approval.~~ **Changed (Wade, 25-11-2026): leave is a record, not a request.** "I don't want this app to be how they request to take annual leave or use sick leave. They still need to text or ring their manager to ask. All I want is: they work Monday, Tuesday, Wednesday, but Thursday, Friday they're off on sick leave, so they can input 'I've been away on sick leave'. Their manager knows, but Sam might not, so it's already on their timesheet for the fortnight." So: **no approval step**, nothing goes to Waiting for approval, it goes straight onto their timesheet.

How step 6 works (built 25-11-2026; details chosen by Claude, tell Wade if any need changing):

- **My shifts** has **+ Record leave** (next to + Add a missed day) → `#leave`. The form starts with an amber note: "This doesn't ask for leave. Sort it out with your manager by phone or text first, then put it here so it's on your timesheet."
- Type (big Sick / Annual / Bereavement buttons), **First day** and **Last day** (today by default; any date, past or future), then **Hours each day**: 8 unless changed (e.g. 4 for half a day); **weekends start at 0** in a range (can be changed); days left at 0 aren't recorded. Days + total hours shown. Optional note. **Save leave**. Up to 62 days at once.
- Saved on the phone and synced like taps (queue type `leave`), so it works with no signal. **My leave** card on My shifts lists each entry ("Waiting to sync" / "On your timesheet") with **Remove** (asks first; type `leave_remove`; the entry is kept on the server marked removed, not deleted). The last-14-days list shows leave on each day ("Sick leave 8h").
- **Admins:** each person's fortnight history shows leave on each day ("Sick leave 8h · <note>"), including days with no shifts and future days already recorded in that fortnight; **Fortnight totals** add hours for each leave type. Leave is not on the dashboard and not in Waiting for approval.
- **Admins can edit and delete anyone's leave (Wade, 25-11-2026).** Each leave line on the employee history has **Edit** (`#lvedit-<id>`: the same leave form, titled "Edit leave · <name>", without the "doesn't ask for leave" note; **Save changes** goes straight to the server, needs signal) and **Delete** (asks first; deletes the whole entry, kept on the server marked removed). Who changed/removed it is stored (`updated_by`, `removed_by`; `worker/migrations/0008_leave_admin.sql`). API: `GET/PUT/DELETE /api/admin/leave/<id>`. The worker's phone picks up the change on its next sync.
- Sam (no clock-in) can't record leave. Admins who clock in can.
- Database: `leave_entries` (person, type, first/last day, note, entered_at, removed_at) + `leave_days` (entry, date, hours) — `worker/migrations/0007_leave.sql`. API: sync types `leave` and `leave_remove`; `GET /api/my/leave` (last 60 days + future); `GET /api/admin/people/<id>/shifts` returns `leave` days. Phone storage adds `nzcst.leave.<person>`.

### 5. Admin dashboard
- Live view: who is clocked in now and who is on a break.
- Each worker's daily hours, breaks, jobs and leave.
- Adjustment and leave requests waiting for approval.
- Map (OpenStreetMap) of where each worker clocked in and out.
- Manage workers (add, deactivate, reset PIN).

**Dashboard redesign (Wade, 25-11-2026):** "I want a list of who's clocked in currently, and then an option where you can view employees: tap on someone's name, e.g. Gareth Coyle, and see their previous clocking history." Wade's choices: remove the day-by-day Hours view but **keep today's map** on the dashboard; history shown **by fortnight**.

How the dashboard works now (built 25-11-2026; details chosen by Claude, tell Wade if any need changing):

- Admins (including Sam) get **Dashboard**, **Manage people** and **Settings** on the Admin card. Workers can't open any of them (the API returns 403). Everything here needs signal.
- **Dashboard** (`#dash`, refreshes every 30 seconds): **Waiting for approval** (step 5), then **Clocked in now (N)**: only people on site or on break, sorted on site → on break, each with "since 7:02am · Phone last synced <time>" (someone still clocked in from an earlier day shows amber "On site since <day> <time> (forgot to clock out?)"); "Nobody is clocked in right now" when empty. Tapping a name opens their history. Then **View employees**, then **Today's clock in and out locations** map (green = Clock In, red = Clock Out, tap for name/time/accuracy; "No location recorded" list under it). Data from `GET /api/admin/day` (today).
- **View employees** (`#staff`): everyone who clocks in (not Sam), active first, with an On site / On break tag; turned-off logins at the bottom marked "Turned off" (their history is still viewable).
- **Employee history** (`#emp-<id>`): name, "Clocked in now · Phone last synced …"; **one fortnight at a time** with ‹ › (not into the future) and "Back to this fortnight"; **Fortnight totals** (worked, breaks, days worked); **Days** newest first: each day worked with its total and each shift (times + hours, "(next day)", breaks, job text or "Jobs not filled in yet" / "No jobs entered", location flags, Adjusted / was / approved by), days with nothing as a thin "No shifts" line; then a **map of that fortnight's clock in/out pins**. `GET /api/admin/people/<id>/shifts?from=&to=` (max 62 days).
- **Settings** (`#settings`): **Fortnight starts on** (any first day of a pay fortnight; fortnights repeat every 14 days before and after it). Until it's set, fortnights start on Mondays (from 16-11-2026) and the history page says so. Stored in the `settings` table (`worker/migrations/0006_settings.sql`); `GET /api/settings` (anyone logged in), `PUT /api/admin/settings` {fortnight_start}. The PDF (step 7) will use the same fortnights.
- Last sync time is stored on `people.last_sync_at` (set when a phone's sync saves anything; `worker/migrations/0004_last_sync.sql`).
- Leave (step 6) shows on the employee history; it never goes to Waiting for approval (leave is a record, not a request).

### 6. Fortnightly timesheet PDF
- One PDF per worker per fortnight: each day's clock in/out, breaks, total hours and jobs; leave by type and hours; approved adjustments marked as adjusted; fortnight totals (hours worked + hours of each leave type).
- ~~Workers have a "Send my fortnight" button that sends the PDF to Sam.~~ **Changed (Wade, 25-11-2026):** no "Send my fortnight" and no sending from the app/Gmail. Instead **"Download my fortnight (PDF)"**, then a prompt to send it themselves by email to **admin@nzconservation.nz**.
- Admins (including Sam) can download any worker's PDF for any fortnight.
- **Fortnight start date:** **30-11-2026** (Wade set it in Settings on 25-11-2026; fortnights run every 14 days from it, so the one before is 16-11 to 29-11).

How step 7 works (built 25-11-2026; details chosen by Claude, tell Wade if any need changing):

- **Workers:** top of **My shifts**, card **Fortnight timesheet**: **This fortnight / Last fortnight**, the dates, **Download my fortnight (PDF)**. It syncs first; if anything is still waiting to sync, or there's no signal, it says so and doesn't make the PDF (so it's never missing entries). Data from `GET /api/my/fortnight?from=&to=`. After the download a green box **"Now email it to Sam"**: address `admin@nzconservation.nz` (`PAYROLL_EMAIL` in index.html), **Email the PDF** (phone share menu with the PDF attached; only on phones that support sharing files), **Open email** (mailto to that address with subject "Timesheet - <name> - <dates>" and a short body; they attach the downloaded PDF) and **Copy address**.
- **Admins:** **Download PDF timesheet** button under Fortnight totals on each employee's history (the fortnight being viewed).
- **The PDF** (jsPDF, A4, made on the phone): NZCS logo, "Timesheet", name, "Fortnight <first day> to <last day>", "NZ Conservation Services Ltd". A table with **every day of the fortnight**: Day | In | Out | Breaks | Hours | Job / where; one row per shift; leave rows ("Sick leave - <note>", hours); days with nothing say "No shifts". Adjusted times have **\*** and the job cell says "\* Adjusted, approved by <name>" ("missed day added" for missed days). A shift with no clock-out shows "Not clocked out", isn't counted, and a red line at the top says how many. **Fortnight totals**: Hours worked, Breaks (not counted), each leave type, **Total (worked + leave)**, all as "h m (decimal)". Footer: made date/time and by whom, page numbers. **No locations.** File name `NZCS Timesheet - <name> - <dd-mm-yyyy> to <dd-mm-yyyy>.pdf`.
- No `timesheet_submissions` table: nothing is sent from the app, so there's nothing to track.

### Share the app (Wade, 25-11-2026)

- Home screen (everyone, workers and admins), card **Share the app** above Log out: opens the phone's share menu with one message: the **live** link `https://wade-14.github.io/nzcs-timesheet/` (`APP_URL`, also from the preview copy), the iPhone and Android install steps, and "tap your name and enter your PIN (ask an admin for it)". No share menu → shows the message with **Copy message**. The link needs no code (each person has their own PIN).

### Phone alerts for admins (Wade, 25-11-2026)

- "Does making an adjustment request send a notification to admins?" It didn't; Wade asked for it. Now each admin turns on **Phone alerts** per phone (bottom of the Admin card: **Turn on alerts** → phone's notification permission). On iPhone the app must be on the home screen and opened from there (iOS 16.4+); the card says so.
- When a **fix a shift / missed day** request reaches the server, every admin phone with alerts on gets **"New request to approve"** / "<Name>: fix a shift, Tue 24-11-2026" (or "missed day, …"; several in one sync are combined). Tap → Dashboard. The person who sent it isn't alerted about their own request. Leave doesn't alert (it's a record, not a request). No alerts to workers (not asked for).
- How: Web Push with no message body, same approach as NZCS Forms' incident alerts. Tables `push_subs` (endpoint, person, last_fetch) and `notices` (title, body, url, exclude_person; deleted after 7 days by the daily cron, Wade 25-11-2026) — `worker/migrations/0009_push.sql`. API: `GET /api/push/key`, `POST /api/push/subscribe` (admins only; push address must be a known push service), `POST /api/push/unsubscribe`, `POST /api/push/notices` (no login: the service worker proves itself with its push address; returns notices since that phone last asked, so nothing repeats). Pings go out after the sync response (`ctx.waitUntil`). Subscriptions for turned-off or non-admin people are ignored; dead ones (404/410) are deleted. `sw.js` shows them (tag `nzcst-<id>`; fallback "New request to approve / Open the Dashboard to see it."). Signing key: public `VAPID_PUBLIC` in `wrangler.toml` `[vars]`, private JWK in the **`VAPID_PRIVATE_JWK`** secret (made for this app; not the forms app's key). Timesheet and forms apps have separate service workers, so separate alert sign-ups, but the browser's notification permission for wade-14.github.io is shared.
- Tested: 13 API tests (key served, admins sign up, odd address refused, workers can't, request → notice text, no repeats, second admin gets it, no alert for own request, unknown phone refused, turn off), the signing key pair verified, and in the browser the Admin card switch plus the service worker turning a ping into "New request to approve — Nigel Spencer: fix a shift, Tue 24-11-2026" opening `#dash` (the test browser can't grant notification permission or reach Google/Apple push, so real delivery still needs checking on a real phone).

### Offline (required)
- Clocking, breaks, jobs, leave requests and adjustment requests save on the phone immediately and sync automatically when signal returns.
- Clear sync status, e.g. "3 entries waiting to sync".
- Approvals and the live dashboard need a connection; they update once a worker's phone has synced.

### Design
- Very simple. Usable with gloves on, outdoors, in bright sunlight: large buttons, high contrast.
- NZ date format (dd-mm-yyyy), NZ timezone (Pacific/Auckland), NZ English.
- **Dark mode (Wade, 25-11-2026):** the app follows the phone's light/dark setting (CSS `prefers-color-scheme`), so people who use dark mode get the dark theme. Don't force light.

## Planned database (D1, draft)

- `people` ✅ and `sessions` ✅ (built in step 1, see Logins).
- `shifts` ✅ and `breaks` ✅ (built in step 2, `worker/migrations/0002_shifts.sql`). Adjusted flag gets added in step 5.
- Jobs text ✅ is on `shifts` (`jobs`, `jobs_at`; step 3).
- `adjustments` ✅ (step 5; covers both fixes and missed days). In-app notification uses `adjustments.seen_at`, so no separate `notifications` table so far.
- `leave_entries` ✅ + `leave_days` ✅ (step 6; records, no approval/status).
- ~~`timesheet_submissions`~~ not needed (PDFs are downloaded and emailed by the person, not sent from the app). ~~`notifications`~~ not needed (outcome boxes use `adjustments.seen_at`).
- `settings` ✅ (fortnight start date; built with the dashboard redesign).

## Build order (from the brief)

1. Logins and roles (worker and admin). ✅ built 24-11-2026 and live (25-11-2026)
2. Clock in/out and breaks, with offline storage and sync. ✅ built 24-11-2026 and live (25-11-2026)
3. Job recording. ✅ built 25-11-2026 and live (25-11-2026)
4. Admin dashboard (live status and daily hours). ✅ built 25-11-2026 and live (25-11-2026) (approvals list added in steps 5–6)
5. Adjustment requests and approvals. ✅ built and live 25-11-2026
6. Leave. ✅ built and live 25-11-2026 (records, no approval: Wade's change)
7. Fortnightly PDF (download + email prompt). ✅ built and live 25-11-2026
8. Test with a few staff, then roll out to everyone. ← now (trial from the week of 30-11-2026)

## Open questions (to ask when we reach that step)

- (Answered 25-11-2026: forgot to clock in → clock in late + adjust start; missed day → missed-day request. Times are locked once recorded; every change goes through a request.)
- (Answered 25-11-2026: no sending; download + email prompt to admin@nzconservation.nz. Fortnight start 30-11-2026.)

## Working rules

- Ask Wade before adding fields or features he didn't ask for.
- Record each decision in this file in the same commit as the change.
