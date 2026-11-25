// NZCS Timesheet API: logins (name + 4-digit PIN), people, clock in/out + breaks + jobs per shift, adjustment requests, leave records, stored in Cloudflare D1.
// Each person has their own login. PINs are stored only as salted PBKDF2 hashes.
// SETUP_CODE (Cloudflare secret) lets someone set the first PIN for a person who has none yet.

const ALLOWED_ORIGINS = ["https://wade-14.github.io"];
const MAX_BODY = 200_000;          // a big offline backlog of taps is ~60 KB
const SESSION_DAYS = 365;          // phones stay logged in, so the app works offline after the first login
const MAX_TRIES = 5;               // wrong PINs in a row before the login is locked
const LOCK_MINUTES = 15;
const PBKDF2_ITERATIONS = 100_000; // the most Cloudflare Workers allow

function cors(req, env) {
  const origin = req.headers.get("Origin") || "";
  const extra = (env.EXTRA_ORIGINS || "").split(",").map(s => s.trim()).filter(Boolean);
  const ok = ALLOWED_ORIGINS.concat(extra).includes(origin);
  return {
    "Access-Control-Allow-Origin": ok ? origin : ALLOWED_ORIGINS[0],
    "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}
const json = (req, env, body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...cors(req, env) } });
class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } }

const now = () => new Date().toISOString();
const uid = () => crypto.randomUUID().replace(/-/g, "");
const hex = buf => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
const randomHex = n => hex(crypto.getRandomValues(new Uint8Array(n)));
const sha256 = async text => hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)));
const isPin = p => /^\d{4}$/.test(String(p ?? ""));

async function hashPin(pin, salt) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(pin), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: new TextEncoder().encode(salt), iterations: PBKDF2_ITERATIONS }, key, 256);
  return hex(bits);
}
function sameText(a, b) {   // constant-time compare
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

async function readBody(req) {
  const text = await req.text();
  if (text.length > MAX_BODY) throw new HttpError(413, "That's too much data.");
  try { return JSON.parse(text || "{}"); } catch { throw new HttpError(400, "The app sent something unreadable. Reload and try again."); }
}

// What the app is told about a person (never PIN details).
const publicPerson = p => ({
  id: p.id, first_name: p.first_name, last_name: p.last_name, role: p.role,
  clocks_in: !!p.clocks_in, active: !!p.active, has_pin: !!p.pin_hash,
});

function cleanName(v, label) {
  const s = String(v ?? "").trim().replace(/\s+/g, " ");
  if (!s) throw new HttpError(400, `Enter a ${label}.`);
  if (s.length > 40) throw new HttpError(400, `The ${label} is too long.`);
  return s;
}

async function newSession(env, personId) {
  const token = randomHex(32);
  const t = now();
  const expires = new Date(Date.now() + SESSION_DAYS * 86400_000).toISOString();
  await env.DB.prepare("INSERT INTO sessions (token_hash, person_id, created_at, expires_at, last_seen) VALUES (?1, ?2, ?3, ?4, ?3)")
    .bind(await sha256(token), personId, t, expires).run();
  return token;
}

// Who is calling: checks the "Authorization: Bearer <token>" header.
async function auth(req, env) {
  const m = /^Bearer ([0-9a-f]{64})$/.exec(req.headers.get("Authorization") || "");
  if (!m) throw new HttpError(401, "Please log in.");
  const tokenHash = await sha256(m[1]);
  const row = await env.DB.prepare(
    `SELECT p.*, s.expires_at, s.last_seen FROM sessions s JOIN people p ON p.id = s.person_id WHERE s.token_hash = ?1`).bind(tokenHash).first();
  if (!row || row.expires_at < now() || !row.active) throw new HttpError(401, "Please log in again.");
  if (Date.now() - Date.parse(row.last_seen) > 3600_000)   // note activity at most hourly
    await env.DB.prepare("UPDATE sessions SET last_seen = ?1 WHERE token_hash = ?2").bind(now(), tokenHash).run();
  return { person: row, tokenHash };
}
const requireAdmin = me => { if (me.person.role !== "admin") throw new HttpError(403, "Only admins can do that."); };

async function getPerson(env, id) {
  const p = await env.DB.prepare("SELECT * FROM people WHERE id = ?1").bind(String(id ?? "")).first();
  if (!p) throw new HttpError(404, "That person wasn't found.");
  return p;
}

async function setPin(env, id, pin) {
  const salt = randomHex(16);
  await env.DB.prepare("UPDATE people SET pin_hash = ?1, pin_salt = ?2, failed_pins = 0, locked_until = NULL, updated_at = ?3 WHERE id = ?4")
    .bind(await hashPin(pin, salt), salt, now(), id).run();
}

/* ---------- Routes ---------- */

async function login(req, env) {
  const b = await readBody(req);
  const p = await getPerson(env, b.person_id);
  if (!p.active) throw new HttpError(403, "This login has been turned off. Talk to an admin.");
  if (!p.pin_hash) throw new HttpError(409, "Your PIN hasn't been set up yet. Ask an admin to set it.");
  if (p.locked_until && p.locked_until > now()) {
    const mins = Math.ceil((Date.parse(p.locked_until) - Date.now()) / 60000);
    throw new HttpError(429, `Too many wrong PINs. Try again in ${mins} minute${mins === 1 ? "" : "s"}, or ask an admin to reset your PIN.`);
  }
  if (!isPin(b.pin) || !sameText(await hashPin(b.pin, p.pin_salt), p.pin_hash)) {
    const tries = p.failed_pins + 1;
    const lock = tries >= MAX_TRIES ? new Date(Date.now() + LOCK_MINUTES * 60000).toISOString() : null;
    await env.DB.prepare("UPDATE people SET failed_pins = ?1, locked_until = ?2 WHERE id = ?3").bind(lock ? 0 : tries, lock, p.id).run();
    if (lock) throw new HttpError(429, `Too many wrong PINs. Try again in ${LOCK_MINUTES} minutes, or ask an admin to reset your PIN.`);
    const left = MAX_TRIES - tries;
    throw new HttpError(401, `Wrong PIN. ${left} ${left === 1 ? "try" : "tries"} left.`);
  }
  await env.DB.prepare("UPDATE people SET failed_pins = 0, locked_until = NULL WHERE id = ?1").bind(p.id).run();
  return { token: await newSession(env, p.id), me: publicPerson(p) };
}

// First PIN for someone who has none, using the setup code. Used to get the first admin in.
async function setupPin(req, env) {
  const b = await readBody(req);
  if (!env.SETUP_CODE) throw new HttpError(503, "Setup isn't turned on.");
  const p = await getPerson(env, b.person_id);
  if (!p.active) throw new HttpError(403, "This login has been turned off.");
  if (p.pin_hash) throw new HttpError(409, "This person already has a PIN. An admin can reset it.");
  if (p.locked_until && p.locked_until > now()) throw new HttpError(429, "Too many wrong setup codes. Try again later.");
  if (!sameText(await sha256(String(b.setup_code ?? "").trim()), await sha256(String(env.SETUP_CODE).trim()))) {
    const tries = p.failed_pins + 1;
    const lock = tries >= MAX_TRIES ? new Date(Date.now() + LOCK_MINUTES * 60000).toISOString() : null;
    await env.DB.prepare("UPDATE people SET failed_pins = ?1, locked_until = ?2 WHERE id = ?3").bind(lock ? 0 : tries, lock, p.id).run();
    throw new HttpError(401, "That setup code isn't right.");
  }
  if (!isPin(b.pin)) throw new HttpError(400, "The PIN must be 4 numbers.");
  await setPin(env, p.id, b.pin);
  return { token: await newSession(env, p.id), me: publicPerson({ ...p, pin_hash: "set" }) };
}

async function adminAddPerson(req, env) {
  const b = await readBody(req);
  const first = cleanName(b.first_name, "first name"), last = cleanName(b.last_name, "last name");
  const role = b.role === "admin" ? "admin" : "worker";
  const clocks = b.clocks_in === false ? 0 : 1;
  const dupe = await env.DB.prepare("SELECT id FROM people WHERE first_name = ?1 COLLATE NOCASE AND last_name = ?2 COLLATE NOCASE").bind(first, last).first();
  if (dupe) throw new HttpError(409, `${first} ${last} is already on the list.`);
  const withPin = b.pin !== undefined && b.pin !== "";
  if (withPin && !isPin(b.pin)) throw new HttpError(400, "The PIN must be 4 numbers.");
  const id = uid(), t = now();
  await env.DB.prepare("INSERT INTO people (id, first_name, last_name, role, clocks_in, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?6)")
    .bind(id, first, last, role, clocks, t).run();
  if (withPin) await setPin(env, id, b.pin);
  return { person: publicPerson(await getPerson(env, id)) };
}

async function adminEditPerson(req, env, me, id) {
  const b = await readBody(req);
  const p = await getPerson(env, id);
  const first = b.first_name !== undefined ? cleanName(b.first_name, "first name") : p.first_name;
  const last = b.last_name !== undefined ? cleanName(b.last_name, "last name") : p.last_name;
  const role = b.role !== undefined ? (b.role === "admin" ? "admin" : "worker") : p.role;
  const clocks = b.clocks_in !== undefined ? (b.clocks_in ? 1 : 0) : p.clocks_in;
  const active = b.active !== undefined ? (b.active ? 1 : 0) : p.active;
  if (p.id === me.person.id && (!active || role !== "admin"))
    throw new HttpError(400, "You can't turn off your own login or remove your own admin access. Ask another admin.");
  const dupe = await env.DB.prepare("SELECT id FROM people WHERE first_name = ?1 COLLATE NOCASE AND last_name = ?2 COLLATE NOCASE AND id != ?3").bind(first, last, p.id).first();
  if (dupe) throw new HttpError(409, `${first} ${last} is already on the list.`);
  const stmts = [env.DB.prepare("UPDATE people SET first_name = ?1, last_name = ?2, role = ?3, clocks_in = ?4, active = ?5, updated_at = ?6 WHERE id = ?7")
    .bind(first, last, role, clocks, active, now(), p.id)];
  if (!active) stmts.push(env.DB.prepare("DELETE FROM sessions WHERE person_id = ?1").bind(p.id));   // log them out everywhere
  await env.DB.batch(stmts);
  return { person: publicPerson(await getPerson(env, p.id)) };
}

async function adminSetPin(req, env, id) {
  const b = await readBody(req);
  const p = await getPerson(env, id);
  if (!isPin(b.pin)) throw new HttpError(400, "The PIN must be 4 numbers.");
  await setPin(env, p.id, b.pin);
  return { person: publicPerson(await getPerson(env, p.id)) };
}

/* ---------- Clocking (step 2) ---------- */

const MAX_EVENTS = 200;
const MAX_JOBS = 2000;             // characters in the jobs box
const isId = v => /^[0-9a-f-]{32,36}$/.test(String(v ?? ""));
const isTime = v => typeof v === "string" && v.length <= 40 && !Number.isNaN(Date.parse(v));
const iso = v => new Date(v).toISOString();
// NZ calendar date (yyyy-mm-dd) of a moment, in Pacific/Auckland time.
const nzDate = v => new Intl.DateTimeFormat("en-CA", { timeZone: "Pacific/Auckland", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(v));
const LOC_STATUSES = ["ok", "denied", "unavailable"];
function cleanLoc(l) {
  const status = l && LOC_STATUSES.includes(l.status) ? l.status : "unavailable";
  if (status !== "ok") return { status, lat: null, lng: null, acc: null };
  const lat = Number(l.lat), lng = Number(l.lng), acc = Number(l.acc);
  if (!(Math.abs(lat) <= 90 && Math.abs(lng) <= 180)) return { status: "unavailable", lat: null, lng: null, acc: null };
  return { status, lat, lng, acc: Number.isFinite(acc) ? Math.round(acc) : null };
}

// Applies one tap from the phone. Every step is safe to repeat (signal can drop after the server saved it).
async function applyEvent(env, person, ev) {
  if (!ev || typeof ev !== "object") throw new Error("Unreadable entry.");
  if (!isId(ev.id) || !isTime(ev.at)) throw new Error("Entry is missing its id or time.");
  const at = iso(ev.at), t = now();
  const ownShift = async id => {
    const s = await env.DB.prepare("SELECT * FROM shifts WHERE id = ?1").bind(String(id)).first();
    if (!s) throw new Error("Its shift hasn't reached the server.");
    if (s.person_id !== person.id) throw new Error("That shift belongs to someone else.");
    return s;
  };
  if (ev.type === "clock_in") {
    const existing = await env.DB.prepare("SELECT person_id FROM shifts WHERE id = ?1").bind(ev.id).first();
    if (existing) { if (existing.person_id !== person.id) throw new Error("That shift belongs to someone else."); return; }
    const l = cleanLoc(ev.loc);
    await env.DB.prepare(`INSERT INTO shifts (id, person_id, work_date, clock_in_at, in_lat, in_lng, in_acc, in_loc, created_at, updated_at)
      VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?9)`).bind(ev.id, person.id, nzDate(at), at, l.lat, l.lng, l.acc, l.status, t).run();
    return;
  }
  if (ev.type === "break_start") {
    const s = await ownShift(ev.shift_id);
    const b = await env.DB.prepare("SELECT shift_id FROM breaks WHERE id = ?1").bind(ev.id).first();
    if (b) { if (b.shift_id !== s.id) throw new Error("Break mix-up."); return; }
    await env.DB.prepare("INSERT INTO breaks (id, shift_id, start_at, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?4)").bind(ev.id, s.id, at, t).run();
    return;
  }
  if (ev.type === "break_end") {
    const b = await env.DB.prepare("SELECT * FROM breaks WHERE id = ?1").bind(ev.id).first();
    if (!b) throw new Error("Its break hasn't reached the server.");
    await ownShift(b.shift_id);
    await env.DB.prepare("UPDATE breaks SET end_at = ?1, updated_at = ?2 WHERE id = ?3 AND end_at IS NULL").bind(at, t, ev.id).run();
    return;
  }
  if (ev.type === "clock_out") {
    const s = await ownShift(ev.id);
    if (s.clock_out_at) return;
    const l = cleanLoc(ev.loc);
    await env.DB.batch([
      // A break still running when they clock out ends at the clock-out time.
      env.DB.prepare("UPDATE breaks SET end_at = ?1, updated_at = ?2 WHERE shift_id = ?3 AND end_at IS NULL").bind(at, t, s.id),
      env.DB.prepare(`UPDATE shifts SET clock_out_at = ?1, out_lat = ?2, out_lng = ?3, out_acc = ?4, out_loc = ?5, updated_at = ?6
        WHERE id = ?7 AND clock_out_at IS NULL`).bind(at, l.lat, l.lng, l.acc, l.status, t, s.id),
    ]);
    return;
  }
  if (ev.type === "jobs") {
    const sh = await ownShift(ev.shift_id);
    const text = String(ev.text ?? "").slice(0, MAX_JOBS);
    await env.DB.prepare("UPDATE shifts SET jobs = ?1, jobs_at = ?2, updated_at = ?3 WHERE id = ?4 AND (jobs_at IS NULL OR jobs_at <= ?2)")
      .bind(text, at, t, sh.id).run();
    return;
  }
  if (ev.type === "adjust") {
    const existing = await env.DB.prepare("SELECT person_id FROM adjustments WHERE id = ?1").bind(ev.id).first();
    if (existing) { if (existing.person_id !== person.id) throw new Error("That request belongs to someone else."); return; }
    const kind = ev.kind === "day" ? "day" : "shift";
    const reason = String(ev.reason ?? "").trim().slice(0, MAX_JOBS);
    if (!reason) throw new Error("The request needs a reason.");
    let original = null, sh = null;
    if (kind === "shift") {
      sh = await ownShift(ev.shift_id);
      original = await shiftSnapshot(env, sh);
    }
    const r = cleanRequest(ev.request, kind, sh);
    await env.DB.prepare(`INSERT INTO adjustments (id, person_id, kind, shift_id, work_date, original, requested, reason, requested_at, created_at)
      VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)`)
      .bind(ev.id, person.id, kind, sh ? sh.id : null, nzDate(r.start), original && JSON.stringify(original), JSON.stringify(r), reason, at, t).run();
    return { newRequest: { kind, work_date: nzDate(r.start) } };   // admins get a phone alert
  }
  if (ev.type === "leave") {
    const existing = await env.DB.prepare("SELECT person_id FROM leave_entries WHERE id = ?1").bind(ev.id).first();
    if (existing) { if (existing.person_id !== person.id) throw new Error("That leave belongs to someone else."); return; }
    const { type, days, note } = cleanLeave(ev);
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO leave_entries (id, person_id, leave_type, start_date, end_date, note, entered_at, created_at)
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)`).bind(ev.id, person.id, type, days[0].date, days[days.length - 1].date, note, at, t),
      ...days.map(d => env.DB.prepare("INSERT INTO leave_days (entry_id, work_date, hours) VALUES (?1, ?2, ?3)").bind(ev.id, d.date, d.hours)),
    ]);
    return;
  }
  if (ev.type === "leave_remove") {   // a person removing leave they recorded by mistake (kept, marked removed)
    const l = await env.DB.prepare("SELECT person_id FROM leave_entries WHERE id = ?1").bind(String(ev.id)).first();
    if (!l) throw new Error("That leave hasn't reached the server.");
    if (l.person_id !== person.id) throw new Error("That leave belongs to someone else.");
    await env.DB.prepare("UPDATE leave_entries SET removed_at = ?1 WHERE id = ?2 AND removed_at IS NULL").bind(t, ev.id).run();
    return;
  }
  throw new Error("Unknown kind of entry.");
}

/* ---------- Leave (step 6) ---------- */
function cleanLeave(b) {
  const type = LEAVE_TYPES.includes(b.leave_type) ? b.leave_type : null;
  if (!type) throw new Error("Pick the type of leave.");
  const days = (Array.isArray(b.days) ? b.days : []).slice(0, MAX_LEAVE_DAYS + 1).map(d => {
    if (!d || !isYmd(d.date)) throw new Error("A leave day is missing its date.");
    const h = Math.round(Number(d.hours) * 100) / 100;
    if (!(h > 0 && h <= 24)) throw new Error("Leave hours must be more than 0 and no more than 24 a day.");
    return { date: d.date, hours: h };
  }).sort((a, b) => a.date < b.date ? -1 : 1);
  if (!days.length) throw new Error("The leave has no days with hours.");
  if (days.length > MAX_LEAVE_DAYS) throw new Error(`Leave can be recorded for up to ${MAX_LEAVE_DAYS} days at a time.`);
  for (let i = 1; i < days.length; i++) if (days[i].date === days[i - 1].date) throw new Error("The same day is in the leave twice.");
  const note = String(b.note ?? "").trim().slice(0, MAX_JOBS) || null;
  return { type, days, note };
}

// Admins editing / deleting anyone's leave (Wade, 25-11-2026).
async function adminLeave(req, env, me, id, method) {
  const l = await env.DB.prepare("SELECT * FROM leave_entries WHERE id = ?1 AND removed_at IS NULL").bind(id).first();
  if (!l) throw new HttpError(404, "That leave wasn't found (it may have been removed).");
  if (method === "GET") {
    const { results } = await env.DB.prepare("SELECT work_date, hours FROM leave_days WHERE entry_id = ?1 ORDER BY work_date").bind(id).all();
    const p = await getPerson(env, l.person_id);
    return { leave: { id: l.id, person_id: l.person_id, name: p.first_name + " " + p.last_name, leave_type: l.leave_type, note: l.note,
      start_date: l.start_date, end_date: l.end_date, days: results.map(d => ({ date: d.work_date, hours: d.hours })) } };
  }
  const t = now();
  if (method === "DELETE") {
    await env.DB.prepare("UPDATE leave_entries SET removed_at = ?1, removed_by = ?2 WHERE id = ?3 AND removed_at IS NULL").bind(t, me.person.id, id).run();
    return { ok: true };
  }
  let c;
  try { c = cleanLeave(await readBody(req)); } catch (e) { if (e instanceof HttpError) throw e; throw new HttpError(400, e.message); }
  await env.DB.batch([
    env.DB.prepare("UPDATE leave_entries SET leave_type = ?1, start_date = ?2, end_date = ?3, note = ?4, updated_at = ?5, updated_by = ?6 WHERE id = ?7")
      .bind(c.type, c.days[0].date, c.days[c.days.length - 1].date, c.note, t, me.person.id, id),
    env.DB.prepare("DELETE FROM leave_days WHERE entry_id = ?1").bind(id),
    ...c.days.map(d => env.DB.prepare("INSERT INTO leave_days (entry_id, work_date, hours) VALUES (?1, ?2, ?3)").bind(id, d.date, d.hours)),
  ]);
  return { ok: true };
}
const LEAVE_TYPES = ["sick", "annual", "bereavement"];
const MAX_LEAVE_DAYS = 62;
const isYmd = v => /^\d{4}-\d{2}-\d{2}$/.test(String(v ?? "")) && !Number.isNaN(Date.parse(v + "T00:00:00Z"));

// Leave entries (not removed) for one person, with their days.
async function listLeave(env, personId, fromDate) {
  const { results } = await env.DB.prepare(
    "SELECT * FROM leave_entries WHERE person_id = ?1 AND removed_at IS NULL AND end_date >= ?2 ORDER BY start_date DESC LIMIT 100").bind(personId, fromDate).all();
  if (!results.length) return [];
  const ids = results.map(l => l.id), days = [];
  for (let i = 0; i < ids.length; i += 90) {
    const chunk = ids.slice(i, i + 90);
    const { results: d } = await env.DB.prepare(
      `SELECT * FROM leave_days WHERE entry_id IN (${chunk.map((_, k) => `?${k + 1}`).join(",")}) ORDER BY work_date`).bind(...chunk).all();
    days.push(...d);
  }
  return results.map(l => ({ id: l.id, leave_type: l.leave_type, start_date: l.start_date, end_date: l.end_date, note: l.note, entered_at: l.entered_at,
    days: days.filter(d => d.entry_id === l.id).map(d => ({ date: d.work_date, hours: d.hours })) }));
}

// Leave days for one person between two dates (removed entries left out).
async function leaveFor(env, personId, from, to) {
  const { results } = await env.DB.prepare(
    `SELECT d.work_date, d.hours, l.leave_type, l.note, l.id AS entry_id FROM leave_days d JOIN leave_entries l ON l.id = d.entry_id
      WHERE l.person_id = ?1 AND l.removed_at IS NULL AND d.work_date >= ?2 AND d.work_date <= ?3 ORDER BY d.work_date`).bind(personId, from, to).all();
  return results;
}

/* ---------- Adjustment requests (step 5) ---------- */

const MAX_SHIFT_MS = 24 * 3600_000;
async function shiftSnapshot(env, sh) {
  const { results } = await env.DB.prepare("SELECT start_at, end_at FROM breaks WHERE shift_id = ?1 ORDER BY start_at").bind(sh.id).all();
  return { start: sh.clock_in_at, end: sh.clock_out_at, breaks: results.map(b => ({ start: b.start_at, end: b.end_at })), jobs: sh.jobs || "" };
}
// What a request may ask for. null = leave as it is (only allowed when fixing an existing shift).
function cleanRequest(r, kind, sh) {
  if (!r || typeof r !== "object") throw new Error("The request is empty.");
  if (!isTime(r.start)) throw new Error("The request needs a start time.");
  const start = iso(r.start);
  if (Date.parse(start) > Date.now() + 10 * 60000) throw new Error("The start time can't be in the future.");
  let end = null;
  if (r.end !== null && r.end !== undefined) {
    if (!isTime(r.end)) throw new Error("The finish time isn't readable.");
    end = iso(r.end);
    if (end <= start) throw new Error("The finish time must be after the start time.");
    if (Date.parse(end) - Date.parse(start) > MAX_SHIFT_MS) throw new Error("A shift can't be longer than 24 hours.");
    if (Date.parse(end) > Date.now() + 10 * 60000) throw new Error("The finish time can't be in the future.");
  } else if (kind === "day" || (sh && sh.clock_out_at)) throw new Error("The request needs a finish time.");
  let breaks = null;
  if (Array.isArray(r.breaks)) {
    breaks = r.breaks.slice(0, 20).map(b => {
      if (!b || !isTime(b.start) || !isTime(b.end)) throw new Error("A break is missing its start or end.");
      const bs = iso(b.start), be = iso(b.end);
      if (be <= bs) throw new Error("A break must end after it starts.");
      if (bs < start || (end && be > end)) throw new Error("Breaks must be within the shift.");
      return { start: bs, end: be };
    }).sort((a, b) => a.start < b.start ? -1 : 1);
    for (let i = 1; i < breaks.length; i++) if (breaks[i].start < breaks[i - 1].end) throw new Error("Two breaks overlap.");
  } else if (kind === "day") breaks = [];
  let jobs = null;
  if (r.jobs !== null && r.jobs !== undefined) jobs = String(r.jobs).slice(0, MAX_JOBS);
  if (kind === "day" && !(jobs || "").trim()) throw new Error("The request needs the job and where.");
  return { start, end, breaks, jobs };
}

async function listRequests(env, where, binds) {
  const { results } = await env.DB.prepare(
    `SELECT a.*, p.first_name, p.last_name, r.first_name AS reviewer_first, r.last_name AS reviewer_last
       FROM adjustments a JOIN people p ON p.id = a.person_id LEFT JOIN people r ON r.id = a.reviewed_by
      WHERE ${where} ORDER BY a.created_at DESC LIMIT 100`).bind(...binds).all();
  return results.map(a => ({
    id: a.id, person_id: a.person_id, name: a.first_name + " " + a.last_name, kind: a.kind, shift_id: a.shift_id, work_date: a.work_date,
    original: a.original ? JSON.parse(a.original) : null, requested: JSON.parse(a.requested), reason: a.reason,
    status: a.status, requested_at: a.requested_at, created_at: a.created_at,
    reviewed_by: a.reviewer_first ? a.reviewer_first + " " + a.reviewer_last : null, reviewed_at: a.reviewed_at, review_note: a.review_note, seen_at: a.seen_at,
  }));
}

async function decideRequest(req, env, me, id) {
  const b = await readBody(req);
  const a = await env.DB.prepare("SELECT * FROM adjustments WHERE id = ?1").bind(id).first();
  if (!a) throw new HttpError(404, "That request wasn't found.");
  if (a.status !== "pending") throw new HttpError(409, "That request has already been " + a.status + ".");
  const note = String(b.note ?? "").trim().slice(0, 1000) || null;
  const t = now();
  const decide = status => env.DB.prepare("UPDATE adjustments SET status = ?1, reviewed_by = ?2, reviewed_at = ?3, review_note = ?4 WHERE id = ?5 AND status = 'pending'")
    .bind(status, me.person.id, t, note, a.id);
  if (b.decision === "decline") { await decide("declined").run(); return { ok: true, status: "declined" }; }
  if (b.decision !== "approve") throw new HttpError(400, "Choose approve or decline.");

  const r = JSON.parse(a.requested);
  const stmts = [];
  const addBreaks = shiftId => (r.breaks || []).map(x => env.DB.prepare("INSERT INTO breaks (id, shift_id, start_at, end_at, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?5)")
    .bind(uid(), shiftId, x.start, x.end, t));
  if (a.kind === "shift") {
    const sh = await env.DB.prepare("SELECT * FROM shifts WHERE id = ?1").bind(a.shift_id).first();
    if (!sh) throw new HttpError(409, "The shift for this request is missing.");
    const end = r.end || sh.clock_out_at;
    if (end && end <= r.start) throw new HttpError(409, "With this change the shift would finish before it starts. Decline it and ask them to send a new request.");
    stmts.push(env.DB.prepare(`UPDATE shifts SET clock_in_at = ?1, work_date = ?2, clock_out_at = COALESCE(?3, clock_out_at),
        jobs = COALESCE(?4, jobs), jobs_at = CASE WHEN ?4 IS NULL THEN jobs_at ELSE ?5 END, adjusted = 1, updated_at = ?5 WHERE id = ?6`)
      .bind(r.start, nzDate(r.start), r.end, r.jobs, t, sh.id));
    if (r.breaks) { stmts.push(env.DB.prepare("DELETE FROM breaks WHERE shift_id = ?1").bind(sh.id), ...addBreaks(sh.id)); }
  } else {
    stmts.push(env.DB.prepare(`INSERT INTO shifts (id, person_id, work_date, clock_in_at, clock_out_at, in_loc, out_loc, jobs, jobs_at, adjusted, created_at, updated_at)
        VALUES (?1, ?2, ?3, ?4, ?5, 'none', 'none', ?6, ?7, 1, ?7, ?7)`).bind(a.id, a.person_id, nzDate(r.start), r.start, r.end, r.jobs || "", t),
      ...addBreaks(a.id),
      env.DB.prepare("UPDATE adjustments SET shift_id = ?1 WHERE id = ?1").bind(a.id));
  }
  stmts.push(decide("approved"));
  await env.DB.batch(stmts);
  return { ok: true, status: "approved" };
}

async function syncEvents(req, env, me, ctx) {
  if (!me.person.clocks_in) throw new HttpError(403, "Your login isn't set up to clock in.");
  const b = await readBody(req);
  const events = Array.isArray(b.events) ? b.events.slice(0, MAX_EVENTS) : [];
  const done = [], errors = [], requests = [];
  for (const ev of events) {   // in the order they were tapped
    try { const r = await applyEvent(env, me.person, ev); done.push(ev.eid); if (r && r.newRequest) requests.push(r.newRequest); }
    catch (e) { errors.push({ eid: ev && ev.eid, error: e.message }); }
  }
  if (done.length) await env.DB.prepare("UPDATE people SET last_sync_at = ?1 WHERE id = ?2").bind(now(), me.person.id).run();
  if (requests.length) {
    const name = me.person.first_name + " " + me.person.last_name;
    const what = r => (r.kind === "day" ? "missed day, " : "fix a shift, ") + dayText(r.work_date);
    const body = requests.length === 1 ? `${name}: ${what(requests[0])}` : `${name} sent ${requests.length} requests (${requests.map(what).join("; ")})`;
    const job = notifyAdmins(env, { title: "New request to approve", body, url: "#dash", exclude: me.person.id });
    if (ctx && ctx.waitUntil) ctx.waitUntil(job.catch(() => {})); else await job;
  }
  return { done, errors };
}

/* ---------- Phone alerts for admins (Web Push, no message body) ----------
   Admins turn alerts on per phone. When a request arrives we record a notice and "ping" each admin phone;
   the app's service worker then asks /api/push/notices what it was about and shows it.
   Signed with the VAPID key pair: public key VAPID_PUBLIC (wrangler.toml var), private JWK VAPID_PRIVATE_JWK (secret). */
const PUSH_HOSTS = [/\.googleapis\.com$/, /\.push\.apple\.com$/, /\.mozilla\.com$/, /\.notify\.windows\.com$/, /^fcm\.googleapis\.com$/];
const b64url = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const b64urlText = text => b64url(new TextEncoder().encode(text));
const dayText = ymd => new Date(ymd + "T12:00:00Z").toLocaleDateString("en-NZ", { timeZone: "UTC", weekday: "short" }) + " " + ymd.split("-").reverse().join("-");
function okEndpoint(u) {
  try { const url = new URL(u); return url.protocol === "https:" && PUSH_HOSTS.some(rx => rx.test(url.hostname)); } catch { return false; }
}
async function vapidJWT(env, aud) {
  const key = await crypto.subtle.importKey("jwk", JSON.parse(env.VAPID_PRIVATE_JWK), { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const head = b64urlText(JSON.stringify({ typ: "JWT", alg: "ES256" }));
  const body = b64urlText(JSON.stringify({ aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: "https://wade-14.github.io/nzcs-timesheet/" }));
  const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, new TextEncoder().encode(head + "." + body));
  return head + "." + body + "." + b64url(sig);
}
async function notifyAdmins(env, { title, body, url, exclude }) {
  await env.DB.prepare("INSERT INTO notices (id, kind, title, body, url, exclude_person, created_at) VALUES (?1, 'request', ?2, ?3, ?4, ?5, ?6)")
    .bind(uid(), title.slice(0, 120), body.slice(0, 300), url, exclude || null, now()).run();
  if (!env.VAPID_PRIVATE_JWK || !env.VAPID_PUBLIC) return;
  const { results } = await env.DB.prepare(
    `SELECT s.endpoint FROM push_subs s JOIN people p ON p.id = s.person_id
      WHERE p.role = 'admin' AND p.active = 1 AND (?1 IS NULL OR s.person_id != ?1)`).bind(exclude || null).all();
  await Promise.all(results.map(async ({ endpoint }) => {
    try {
      const jwt = await vapidJWT(env, new URL(endpoint).origin);
      const r = await fetch(endpoint, { method: "POST", headers: { "Authorization": `vapid t=${jwt}, k=${env.VAPID_PUBLIC}`, "TTL": "86400", "Urgency": "high", "Content-Length": "0" } });
      if (r.status === 404 || r.status === 410) await env.DB.prepare("DELETE FROM push_subs WHERE endpoint = ?1").bind(endpoint).run();
    } catch { /* one bad subscription shouldn't stop the others */ }
  }));
}
// The phone's service worker asks what its pings were about. It has no login, so it proves itself with its push address.
async function pushNotices(req, env) {
  const b = await readBody(req);
  const sub = await env.DB.prepare(
    `SELECT s.*, p.role, p.active FROM push_subs s JOIN people p ON p.id = s.person_id WHERE s.endpoint = ?1`).bind(String(b.endpoint ?? "").slice(0, 1000)).first();
  if (!sub || sub.role !== "admin" || !sub.active) throw new HttpError(403, "Not signed up for alerts.");
  const since = sub.last_fetch && sub.last_fetch > new Date(Date.now() - NOTICE_DAYS * 86400_000).toISOString() ? sub.last_fetch : new Date(Date.now() - 15 * 60000).toISOString();
  const { results } = await env.DB.prepare(
    `SELECT id, title, body, url, created_at FROM notices WHERE created_at > ?1 AND (exclude_person IS NULL OR exclude_person != ?2)
      ORDER BY created_at LIMIT 5`).bind(since, sub.person_id).all();
  await env.DB.prepare("UPDATE push_subs SET last_fetch = ?1 WHERE endpoint = ?2").bind(now(), sub.endpoint).run();
  return { notices: results };
}

// Shift rows → what the app gets: breaks attached, locations grouped.
async function withBreaks(env, shifts) {
  if (!shifts.length) return [];
  const ids = shifts.map(s => s.id);
  const breaks = [];
  for (let i = 0; i < ids.length; i += 90) {   // D1 allows ~100 bound values per query
    const chunk = ids.slice(i, i + 90);
    const { results } = await env.DB.prepare(
      `SELECT * FROM breaks WHERE shift_id IN (${chunk.map((_, k) => `?${k + 1}`).join(",")}) ORDER BY start_at`).bind(...chunk).all();
    breaks.push(...results);
  }
  return shifts.map(s => ({
    id: s.id, person_id: s.person_id, work_date: s.work_date, clock_in_at: s.clock_in_at, clock_out_at: s.clock_out_at, jobs: s.jobs || "", adjusted: !!s.adjusted,
    in_loc: { status: s.in_loc, lat: s.in_lat, lng: s.in_lng, acc: s.in_acc },
    out_loc: s.clock_out_at ? { status: s.out_loc, lat: s.out_lat, lng: s.out_lng, acc: s.out_acc } : null,
    breaks: breaks.filter(b => b.shift_id === s.id).map(b => ({ id: b.id, start_at: b.start_at, end_at: b.end_at })),
  }));
}

// Shifts (with breaks) for one person: from a date onwards, plus any still open.
async function shiftsFor(env, personId, fromDate) {
  const { results } = await env.DB.prepare(
    `SELECT * FROM shifts WHERE person_id = ?1 AND (work_date >= ?2 OR clock_out_at IS NULL) ORDER BY clock_in_at`).bind(personId, fromDate).all();
  return withBreaks(env, results);
}

// Adds what an adjusted shift was before, and who approved it.
async function attachAdjustments(env, shifts) {
  const adjustedIds = shifts.filter(s => s.adjusted).map(s => s.id).slice(0, 90);   // D1 bound-value limit
  if (adjustedIds.length) {
    const { results } = await env.DB.prepare(
      `SELECT a.shift_id, a.kind, a.original, a.reason, r.first_name AS by FROM adjustments a LEFT JOIN people r ON r.id = a.reviewed_by
        WHERE a.status = 'approved' AND a.shift_id IN (${adjustedIds.map((_, i) => `?${i + 1}`).join(",")}) ORDER BY a.reviewed_at`).bind(...adjustedIds).all();
    for (const s of shifts) {
      const mine = results.filter(x => x.shift_id === s.id);
      if (mine.length) s.adjustment = { kind: mine[0].kind, original: mine[0].original ? JSON.parse(mine[0].original) : null,
        reason: mine[mine.length - 1].reason, approved_by: mine[mine.length - 1].by, count: mine.length };
    }
  }
}

const DEFAULT_FORTNIGHT_START = "2026-11-16";   // a Monday; used until an admin sets the real one
async function getSettings(env) {
  const { results } = await env.DB.prepare("SELECT key, value FROM settings").all();
  const m = Object.fromEntries(results.map(r => [r.key, r.value]));
  return { fortnight_start: m.fortnight_start || DEFAULT_FORTNIGHT_START, fortnight_start_set: !!m.fortnight_start };
}

// One person's shifts between two NZ dates (inclusive), for the admin "employee history" page.
async function adminPersonShifts(env, id, from, to) {
  const p = await getPerson(env, id);
  const { results } = await env.DB.prepare(
    "SELECT * FROM shifts WHERE person_id = ?1 AND work_date >= ?2 AND work_date <= ?3 ORDER BY clock_in_at").bind(p.id, from, to).all();
  const shifts = await withBreaks(env, results);
  await attachAdjustments(env, shifts);
  const open = await env.DB.prepare("SELECT id FROM shifts WHERE person_id = ?1 AND clock_out_at IS NULL LIMIT 1").bind(p.id).first();
  return { person: { ...publicPerson(p), last_sync: p.last_sync_at || null, clocked_in: !!open }, from, to, shifts, leave: await leaveFor(env, p.id, from, to) };
}

// Admin dashboard: everyone who clocks in, their shifts on one NZ day, anything still open, and when their phone last synced.
async function adminDay(env, date) {
  const { results: people } = await env.DB.prepare(
    `SELECT * FROM people WHERE (clocks_in = 1 AND active = 1) OR id IN (SELECT person_id FROM shifts WHERE work_date = ?1)
     ORDER BY first_name COLLATE NOCASE, last_name COLLATE NOCASE`).bind(date).all();
  const { results: rows } = await env.DB.prepare(
    `SELECT * FROM shifts WHERE work_date = ?1 OR clock_out_at IS NULL ORDER BY clock_in_at`).bind(date).all();
  const shifts = await withBreaks(env, rows);
  await attachAdjustments(env, shifts);
  return {
    date, today: nzDate(Date.now()), server_time: now(),
    people: people.map(p => ({
      id: p.id, first_name: p.first_name, last_name: p.last_name, active: !!p.active, clocks_in: !!p.clocks_in,
      last_sync: p.last_sync_at || null,
      shifts: shifts.filter(s => s.person_id === p.id && s.work_date === date),
      open: shifts.filter(s => s.person_id === p.id && !s.clock_out_at).pop() || null,
    })),
  };
}

async function route(req, env, ctx) {
  const url = new URL(req.url);
  const path = url.pathname.replace(/\/+$/, "");
  const m = req.method;

  if (path === "/api/health" && m === "GET") return { ok: true };

  // Name list for the login screen: active people only.
  if (path === "/api/people" && m === "GET") {
    const { results } = await env.DB.prepare("SELECT * FROM people WHERE active = 1 ORDER BY first_name COLLATE NOCASE, last_name COLLATE NOCASE").all();
    return { people: results.map(p => ({ id: p.id, first_name: p.first_name, last_name: p.last_name, has_pin: !!p.pin_hash })), setup: !!env.SETUP_CODE };
  }
  if (path === "/api/login" && m === "POST") return login(req, env);
  if (path === "/api/push/notices" && m === "POST") return pushNotices(req, env);
  if (path === "/api/setup-pin" && m === "POST") return setupPin(req, env);

  const me = await auth(req, env);
  if (path === "/api/me" && m === "GET") return { me: publicPerson(me.person) };
  if (path === "/api/logout" && m === "POST") {
    await env.DB.prepare("DELETE FROM sessions WHERE token_hash = ?1").bind(me.tokenHash).run();
    return { ok: true };
  }

  if (path === "/api/sync" && m === "POST") return syncEvents(req, env, me, ctx);
  if (path === "/api/push/key" && m === "GET") return { key: env.VAPID_PUBLIC || "" };
  if (path === "/api/push/subscribe" && m === "POST") {
    requireAdmin(me);
    const b = await readBody(req);
    if (!okEndpoint(b.endpoint)) throw new HttpError(400, "That phone's alert address isn't one the app recognises.");
    await env.DB.prepare(`INSERT INTO push_subs (endpoint, person_id, created_at, last_fetch) VALUES (?1, ?2, ?3, ?3)
      ON CONFLICT (endpoint) DO UPDATE SET person_id = excluded.person_id`).bind(b.endpoint, me.person.id, now()).run();
    return { ok: true };
  }
  if (path === "/api/push/unsubscribe" && m === "POST") {
    const b = await readBody(req);
    await env.DB.prepare("DELETE FROM push_subs WHERE endpoint = ?1 AND person_id = ?2").bind(String(b.endpoint ?? ""), me.person.id).run();
    return { ok: true };
  }
  if (path === "/api/my/shifts" && m === "GET") {
    const from = url.searchParams.get("from");
    const fromDate = /^\d{4}-\d{2}-\d{2}$/.test(from || "") ? from : nzDate(Date.now() - 7 * 86400_000);
    return { shifts: await shiftsFor(env, me.person.id, fromDate), today: nzDate(Date.now()) };   // phone asks for 14 days
  }

  if (path === "/api/settings" && m === "GET") return getSettings(env);
  if (path === "/api/my/requests" && m === "GET") {
    const since = new Date(Date.now() - 60 * 86400_000).toISOString();
    return { requests: await listRequests(env, "a.person_id = ?1 AND a.created_at >= ?2", [me.person.id, since]) };
  }
  if (path === "/api/my/fortnight" && m === "GET") {   // everything for the person's own fortnight PDF
    const from = url.searchParams.get("from"), to = url.searchParams.get("to");
    if (!isYmd(from) || !isYmd(to) || to < from || Date.parse(to) - Date.parse(from) > 31 * 86400_000) throw new HttpError(400, "Pick the fortnight.");
    return adminPersonShifts(env, me.person.id, from, to);
  }
  if (path === "/api/my/leave" && m === "GET") return { leave: await listLeave(env, me.person.id, nzDate(Date.now() - 60 * 86400_000)) };
  let mr = /^\/api\/my\/requests\/([0-9a-f-]{32,36})\/seen$/.exec(path);
  if (mr && m === "POST") {
    await env.DB.prepare("UPDATE adjustments SET seen_at = ?1 WHERE id = ?2 AND person_id = ?3 AND seen_at IS NULL").bind(now(), mr[1], me.person.id).run();
    return { ok: true };
  }

  if (path.startsWith("/api/admin/")) {
    requireAdmin(me);
    if (path === "/api/admin/requests" && m === "GET") {
      if (url.searchParams.get("status") === "recent")
        return { requests: (await listRequests(env, "a.status != 'pending' AND a.reviewed_at >= ?1", [new Date(Date.now() - 30 * 86400_000).toISOString()])) };
      return { requests: (await listRequests(env, "a.status = 'pending'", [])).reverse() };   // oldest first
    }
    if (path === "/api/admin/settings" && m === "PUT") {
      const b = await readBody(req);
      const d = String(b.fortnight_start ?? "");
      if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || Number.isNaN(Date.parse(d + "T00:00:00Z"))) throw new HttpError(400, "Pick a date for the fortnight start.");
      await env.DB.prepare(`INSERT INTO settings (key, value, updated_at, updated_by) VALUES ('fortnight_start', ?1, ?2, ?3)
        ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at, updated_by = excluded.updated_by`).bind(d, now(), me.person.id).run();
      return getSettings(env);
    }
    const lr = /^\/api\/admin\/leave\/([0-9a-f-]{32,36})$/.exec(path);
    if (lr && ["GET", "PUT", "DELETE"].includes(m)) return adminLeave(req, env, me, lr[1], m);
    const pr = /^\/api\/admin\/people\/([0-9a-f]{32})\/shifts$/.exec(path);
    if (pr && m === "GET") {
      const from = url.searchParams.get("from"), to = url.searchParams.get("to");
      if (!/^\d{4}-\d{2}-\d{2}$/.test(from || "") || !/^\d{4}-\d{2}-\d{2}$/.test(to || "") || to < from) throw new HttpError(400, "Pick the dates to show.");
      if (Date.parse(to) - Date.parse(from) > 62 * 86400_000) throw new HttpError(400, "That's too many days at once.");
      return adminPersonShifts(env, pr[1], from, to);
    }
    const dr = /^\/api\/admin\/requests\/([0-9a-f-]{32,36})$/.exec(path);
    if (dr && m === "POST") return decideRequest(req, env, me, dr[1]);
    if (path === "/api/admin/people" && m === "GET") {
      const { results } = await env.DB.prepare("SELECT * FROM people ORDER BY active DESC, first_name COLLATE NOCASE, last_name COLLATE NOCASE").all();
      return { people: results.map(publicPerson) };
    }
    if (path === "/api/admin/people" && m === "POST") return adminAddPerson(req, env);
    if (path === "/api/admin/day" && m === "GET") {
      const date = url.searchParams.get("date");
      return adminDay(env, /^\d{4}-\d{2}-\d{2}$/.test(date || "") ? date : nzDate(Date.now()));
    }
    let r = /^\/api\/admin\/people\/([0-9a-f]{32})$/.exec(path);
    if (r && m === "PUT") return adminEditPerson(req, env, me, r[1]);
    r = /^\/api\/admin\/people\/([0-9a-f]{32})\/pin$/.exec(path);
    if (r && m === "POST") return adminSetPin(req, env, r[1]);
  }
  throw new HttpError(404, "Not found.");
}

export default {
  async fetch(req, env, ctx) {
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(req, env) });
    try {
      return json(req, env, await route(req, env, ctx));
    } catch (e) {
      if (e instanceof HttpError) return json(req, env, { error: e.message }, e.status);
      console.error(e);
      return json(req, env, { error: "Something went wrong on the server. Try again." }, 500);
    }
  },
  async scheduled(_event, env) {
    await tidyUp(env);
  },
};

/* ---------- Daily tidy-up (cron ~3am NZ) ----------
   Wade, 25-11-2026: keep timesheet records for 7 years, then delete them; keep alert messages for 7 days. */
const KEEP_YEARS = 7;
const NOTICE_DAYS = 7;
async function tidyUp(env) {
  const cut = new Date(); cut.setUTCFullYear(cut.getUTCFullYear() - KEEP_YEARS);
  const cutoff = nzDate(cut);   // records for NZ days before this date go
  await env.DB.batch([
    env.DB.prepare("DELETE FROM sessions WHERE expires_at < ?1").bind(now()),
    env.DB.prepare("DELETE FROM notices WHERE created_at < ?1").bind(new Date(Date.now() - NOTICE_DAYS * 86400_000).toISOString()),
    // Shifts more than 7 years old, with their breaks and any requests about them
    env.DB.prepare("DELETE FROM breaks WHERE shift_id IN (SELECT id FROM shifts WHERE work_date < ?1)").bind(cutoff),
    env.DB.prepare("DELETE FROM adjustments WHERE work_date < ?1 OR shift_id IN (SELECT id FROM shifts WHERE work_date < ?1)").bind(cutoff),
    env.DB.prepare("DELETE FROM shifts WHERE work_date < ?1").bind(cutoff),
    // Leave: days more than 7 years old, then entries with no days left
    env.DB.prepare("DELETE FROM leave_days WHERE work_date < ?1").bind(cutoff),
    env.DB.prepare("DELETE FROM leave_entries WHERE end_date < ?1 AND id NOT IN (SELECT entry_id FROM leave_days)").bind(cutoff),
  ]);
}
