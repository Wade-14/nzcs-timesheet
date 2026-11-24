// NZCS Timesheet API: logins (name + 4-digit PIN) and people, stored in Cloudflare D1.
// Each person has their own login. PINs are stored only as salted PBKDF2 hashes.
// SETUP_CODE (Cloudflare secret) lets someone set the first PIN for a person who has none yet.

const ALLOWED_ORIGINS = ["https://wade-14.github.io"];
const MAX_BODY = 20_000;
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
    "Access-Control-Allow-Methods": "GET,POST,PUT,OPTIONS",
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

async function route(req, env) {
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
  if (path === "/api/setup-pin" && m === "POST") return setupPin(req, env);

  const me = await auth(req, env);
  if (path === "/api/me" && m === "GET") return { me: publicPerson(me.person) };
  if (path === "/api/logout" && m === "POST") {
    await env.DB.prepare("DELETE FROM sessions WHERE token_hash = ?1").bind(me.tokenHash).run();
    return { ok: true };
  }

  if (path.startsWith("/api/admin/")) {
    requireAdmin(me);
    if (path === "/api/admin/people" && m === "GET") {
      const { results } = await env.DB.prepare("SELECT * FROM people ORDER BY active DESC, first_name COLLATE NOCASE, last_name COLLATE NOCASE").all();
      return { people: results.map(publicPerson) };
    }
    if (path === "/api/admin/people" && m === "POST") return adminAddPerson(req, env);
    let r = /^\/api\/admin\/people\/([0-9a-f]{32})$/.exec(path);
    if (r && m === "PUT") return adminEditPerson(req, env, me, r[1]);
    r = /^\/api\/admin\/people\/([0-9a-f]{32})\/pin$/.exec(path);
    if (r && m === "POST") return adminSetPin(req, env, r[1]);
  }
  throw new HttpError(404, "Not found.");
}

export default {
  async fetch(req, env) {
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(req, env) });
    try {
      return json(req, env, await route(req, env));
    } catch (e) {
      if (e instanceof HttpError) return json(req, env, { error: e.message }, e.status);
      console.error(e);
      return json(req, env, { error: "Something went wrong on the server. Try again." }, 500);
    }
  },
  async scheduled(_event, env) {
    await env.DB.prepare("DELETE FROM sessions WHERE expires_at < ?1").bind(now()).run();
  },
};
