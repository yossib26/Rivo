// נתיבי כניסה: סיסמה, OTP, סשן בעוגייה (HttpOnly) עם תוקף מוחלט של 30 דקות, וכניסת Google מדומה.
const crypto = require("crypto");
const express = require("express");
const db = require("./db");
const sec = require("./security");
const demo = require("./demo-users");

const SESSION_MS = 30 * 60 * 1000;      // תוקף הסשן: חצי שעה מרגע הכניסה, לא מתחדש בפעילות
const OTP_MS = 2 * 60 * 1000;           // תוקף קוד OTP
const OTP_TRIES = 3;
const MAX_FAILS = 5, LOCK_MS = 30 * 1000;
const RESEND_GAP_MS = 25 * 1000;        // מרווח מינימלי בין שליחות קוד
const CHALLENGE_LIFE_MS = 10 * 60 * 1000; // כמה זמן אחרי סיסמה נכונה אפשר לבקש קוד חדש
const COOKIE = "rivo_session";
const USERNAME_RE = /^[a-z0-9][a-z0-9._-]{2,29}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const flag = (name) => process.env[name] === "1";
const now = () => new Date();

function parseCookies(header = "") {
  const out = {};
  for (const part of header.split(";")) {
    const i = part.indexOf("=");
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}
const isSecure = (req) => req.secure || req.headers["x-forwarded-proto"] === "https" || process.env.NODE_ENV === "production";
// עוגיית סשן בלי Max-Age: נמחקת עם סגירת הדפדפן; התוקף האמיתי נאכף בשרת
const setCookie = (req, res, token) => res.setHeader("Set-Cookie", `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax${isSecure(req) ? "; Secure" : ""}`);
const clearCookie = (res) => res.setHeader("Set-Cookie", `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);

const publicUser = (u) => ({ id: u.id, username: u.username, name: u.name, role: u.role, email: u.email || "", idNumber: u.id_number || "", provider: u.provider });
const maskPhone = (p) => (p ? `${p.slice(0, 3)}-***-${p.slice(-4)}` : "");

// הסשן התקף של הבקשה (או null)
async function currentSession(req) {
  const token = parseCookies(req.headers.cookie)[COOKIE];
  if (!token) return null;
  const r = await db.query(
    `SELECT u.id, u.username, u.name, u.role, u.email, u.id_number, u.provider, s.expires_at
       FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = $1 AND s.expires_at > $2`, [sec.sha256(token), now()]);
  return r.rows[0] || null;
}

async function createSession(req, res, userId) {
  const token = sec.newToken(), expires = new Date(Date.now() + SESSION_MS);
  await db.query("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ($1, $2, $3)", [sec.sha256(token), userId, expires]);
  db.query("DELETE FROM sessions WHERE expires_at < $1", [now()]).catch(() => {}); // ניקוי סשנים שפגו
  setCookie(req, res, token);
  return expires;
}

async function createChallenge(user) {
  const code = sec.randomCode(), id = crypto.randomUUID();
  await db.query("DELETE FROM login_challenges WHERE user_id = $1", [user.id]); // רק אתגר פעיל אחד למשתמש
  await db.query("INSERT INTO login_challenges (id, user_id, code_hash, expires_at) VALUES ($1, $2, $3, $4)", [id, user.id, sec.hmac(code), new Date(Date.now() + OTP_MS)]);
  return { id, code };
}
// אין ספק SMS: במצב הדגמה הקוד חוזר בתגובה כדי שאפשר יהיה להציג אותו כהודעה מדומה
const challengeResponse = (user, ch) => ({ challengeId: ch.id, phoneMasked: maskPhone(user.phone), expiresInSec: OTP_MS / 1000, ...(flag("DEMO_MODE") ? { demoCode: ch.code } : {}) });

// כישלונות של שמות משתמש שאינם קיימים נספרים בזיכרון, כדי שהתגובה לא תסגיר אם המשתמש קיים
const unknownFails = new Map();
function unknownFail(name) {
  const f = unknownFails.get(name) || { n: 0, until: 0 };
  if (f.until > Date.now()) return { locked: Math.ceil((f.until - Date.now()) / 1000) };
  f.n += 1;
  if (f.n >= MAX_FAILS) { f.n = 0; f.until = Date.now() + LOCK_MS; }
  unknownFails.set(name, f);
  return f.until > Date.now() ? { locked: Math.ceil((f.until - Date.now()) / 1000) } : { left: MAX_FAILS - f.n };
}

const router = express.Router();

// הגנה בסיסית מפני CSRF: בקשות POST חייבות להיות JSON מאותו מקור
router.use((req, res, next) => {
  if (req.method === "POST") {
    const origin = req.headers.origin;
    if (origin) { try { if (new URL(origin).host !== req.headers.host) return res.status(403).json({ error: "origin" }); } catch (e) { return res.status(403).json({ error: "origin" }); } }
    if (!(req.headers["content-type"] || "").startsWith("application/json")) return res.status(415).json({ error: "content-type" });
  }
  next();
});

// שלב 1: שם משתמש וסיסמה
router.post("/login", async (req, res, next) => {
  try {
    const { username, password } = req.body || {};
    if (typeof username !== "string" || typeof password !== "string" || !username.trim() || !password || username.length > 100 || password.length > 200) return res.status(400).json({ error: "missing" });
    const name = username.trim().toLowerCase();
    const r = await db.query("SELECT * FROM users WHERE lower(username) = $1 AND verified = TRUE", [name]);
    const user = r.rows[0];

    if (user && user.locked_until && user.locked_until > now()) return res.status(429).json({ error: "locked", retryAfter: Math.ceil((user.locked_until - now()) / 1000) });
    if (!user) {
      await sec.burnTime(password);
      const f = unknownFail(name);
      return f.locked ? res.status(429).json({ error: "locked", retryAfter: f.locked }) : res.status(401).json({ error: "invalid", left: f.left });
    }
    if (!(await sec.verifyPassword(password, user.password_hash))) {
      const fails = user.failed_attempts + 1;
      if (fails >= MAX_FAILS) {
        await db.query("UPDATE users SET failed_attempts = 0, locked_until = $2 WHERE id = $1", [user.id, new Date(Date.now() + LOCK_MS)]);
        return res.status(429).json({ error: "locked", retryAfter: LOCK_MS / 1000 });
      }
      await db.query("UPDATE users SET failed_attempts = $2 WHERE id = $1", [user.id, fails]);
      return res.status(401).json({ error: "invalid", left: MAX_FAILS - fails });
    }
    await db.query("UPDATE users SET failed_attempts = 0, locked_until = NULL WHERE id = $1", [user.id]);
    res.json(challengeResponse(user, await createChallenge(user)));
  } catch (e) { next(e); }
});

// שלב 2: קוד חד-פעמי; בהצלחה נוצר סשן
router.post("/otp/verify", async (req, res, next) => {
  try {
    const { challengeId, code } = req.body || {};
    if (typeof challengeId !== "string" || typeof code !== "string" || !/^\d{6}$/.test(code)) return res.status(400).json({ error: "missing" });
    const r = await db.query("SELECT * FROM login_challenges WHERE id = $1", [challengeId]);
    const ch = r.rows[0];
    if (!ch || ch.consumed) return res.status(400).json({ error: "expired" });
    if (ch.expires_at < now()) return res.status(400).json({ error: "expired" });
    if (ch.attempts >= OTP_TRIES) return res.status(400).json({ error: "locked" });

    if (!sec.safeEqual(sec.hmac(code), ch.code_hash)) {
      const attempts = ch.attempts + 1;
      await db.query("UPDATE login_challenges SET attempts = $2, consumed = $3 WHERE id = $1", [ch.id, attempts, attempts >= OTP_TRIES]);
      return attempts >= OTP_TRIES ? res.status(400).json({ error: "locked" }) : res.status(400).json({ error: "wrong", left: OTP_TRIES - attempts });
    }
    await db.query("UPDATE login_challenges SET consumed = TRUE WHERE id = $1", [ch.id]);
    const u = (await db.query("SELECT * FROM users WHERE id = $1", [ch.user_id])).rows[0];
    if (!u.verified) await db.query("UPDATE users SET verified = TRUE WHERE id = $1", [u.id]); // סיום הרשמה: הטלפון אומת
    const expires = await createSession(req, res, u.id);
    res.json({ user: publicUser(u), expiresAt: expires.getTime() });
  } catch (e) { next(e); }
});

// קוד חדש: מותר עד 10 דקות אחרי סיסמה נכונה, ולא מהר מדי
router.post("/otp/resend", async (req, res, next) => {
  try {
    const { challengeId } = req.body || {};
    if (typeof challengeId !== "string") return res.status(400).json({ error: "missing" });
    const ch = (await db.query("SELECT * FROM login_challenges WHERE id = $1", [challengeId])).rows[0];
    if (!ch || Date.now() - ch.created_at.getTime() > CHALLENGE_LIFE_MS) return res.status(400).json({ error: "expired" });
    const gap = Date.now() - ch.created_at.getTime();
    if (gap < RESEND_GAP_MS && !ch.consumed && ch.attempts < OTP_TRIES) return res.status(429).json({ error: "too_soon", retryAfter: Math.ceil((RESEND_GAP_MS - gap) / 1000) });
    const user = (await db.query("SELECT * FROM users WHERE id = $1", [ch.user_id])).rows[0];
    res.json(challengeResponse(user, await createChallenge(user)));
  } catch (e) { next(e); }
});

// כניסה עם Google (מדומה, ללא OAuth אמיתי): פעיל רק כש-ALLOW_MOCK_GOOGLE=1
router.post("/google", async (req, res, next) => {
  try {
    if (!flag("ALLOW_MOCK_GOOGLE")) return res.status(403).json({ error: "disabled" });
    const email = String((req.body || {}).email || "").trim().toLowerCase(), given = String((req.body || {}).name || "").trim().slice(0, 80);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 120) return res.status(400).json({ error: "email" });
    let u = (await db.query("SELECT * FROM users WHERE lower(email) = $1 AND verified = TRUE", [email])).rows[0];
    // Google מדומה מתחזה לבעל הדוא״ל, ולכן מותר רק למשתמשי Google ולמשתמשי הדמה. משתמש שנרשם עם סיסמה נכנס רק איתה
    if (u && u.provider === "password" && !(flag("DEMO_MODE") && demo.USERS.some((d) => d.username === u.username))) return res.status(409).json({ error: "use_password" });
    if (!u) {
      const local = email.split("@")[0].replace(/[._-]+/g, " ").trim();
      u = { id: crypto.randomUUID(), username: email, name: given || local.replace(/\b\w/g, (c) => c.toUpperCase()), role: "משתמש Google", email, provider: "google" };
      await db.query("INSERT INTO users (id, username, name, role, email, provider) VALUES ($1, $2, $3, $4, $5, 'google')", [u.id, u.username, u.name, u.role, email]);
      u.id_number = ""; u.provider = "google";
    }
    const expires = await createSession(req, res, u.id);
    res.json({ user: publicUser(u), expiresAt: expires.getTime() });
  } catch (e) { next(e); }
});

// הרשמה עם שם משתמש וסיסמה: החשבון נוצר כלא מאומת, ונפתח רק אחרי אימות הטלפון בקוד חד-פעמי (/otp/verify)
const signups = new Map(); // הגבלת קצב פשוטה לפי IP: 10 הרשמות בשעה
router.post("/register", async (req, res, next) => {
  try {
    const b = req.body || {}, str = (v, max) => (typeof v === "string" ? v.trim().slice(0, max) : "");
    const username = str(b.username, 40).toLowerCase(), name = str(b.name, 80), email = str(b.email, 120).toLowerCase(), phone = str(b.phone, 20), idNumber = str(b.idNumber, 9);
    const password = typeof b.password === "string" ? b.password : "";
    const bad = (field, message) => res.status(400).json({ error: "invalid", field, message });
    if (name.length < 2) return bad("name", "יש להזין שם מלא.");
    if (!USERNAME_RE.test(username)) return bad("username", "שם משתמש: 3–30 תווים באנגלית קטנה, ספרות, נקודה, מקף או קו תחתון.");
    if (password.length < 8 || password.length > 100 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) return bad("password", "סיסמה: לפחות 8 תווים, עם אות באנגלית וספרה.");
    if (password.toLowerCase().includes(username)) return bad("password", "הסיסמה לא יכולה לכלול את שם המשתמש.");
    if (!/^05\d{8}$/.test(phone)) return bad("phone", "מספר נייד: 10 ספרות שמתחילות ב-05.");
    if (email && !EMAIL_RE.test(email)) return bad("email", "כתובת דוא״ל לא תקינה.");
    if (idNumber && !/^\d{9}$/.test(idNumber)) return bad("idNumber", "ת״ז: 9 ספרות.");

    const ip = req.ip, hits = (signups.get(ip) || []).filter((t) => Date.now() - t < 3600000);
    if (hits.length >= 10) return res.status(429).json({ error: "rate_limited" });
    signups.set(ip, [...hits, Date.now()]);

    // הרשמות שלא אומתו נמחקות אחרי שעה, וניסיון חוזר עם אותם פרטים מחליף אותן
    await db.query("DELETE FROM users WHERE verified = FALSE AND created_at < $1", [new Date(Date.now() - 3600000)]);
    await db.query("DELETE FROM users WHERE verified = FALSE AND (lower(username) = $1 OR ($2 <> '' AND lower(email) = $2))", [username, email]);
    if ((await db.query("SELECT 1 FROM users WHERE lower(username) = $1", [username])).rows.length) return res.status(409).json({ error: "username_taken" });
    if (email && (await db.query("SELECT 1 FROM users WHERE lower(email) = $1", [email])).rows.length) return res.status(409).json({ error: "email_taken" });

    const id = crypto.randomUUID();
    await db.query(
      "INSERT INTO users (id, username, password_hash, name, role, email, phone, id_number, provider, verified) VALUES ($1, $2, $3, $4, 'לקוח', $5, $6, $7, 'password', FALSE)",
      [id, username, await sec.hashPassword(password), name, email || null, phone, idNumber || null]);
    const user = { id, phone };
    res.json({ ...challengeResponse(user, await createChallenge(user)), purpose: "register" });
  } catch (e) { next(e); }
});

router.get("/me", async (req, res, next) => {
  try {
    const s = await currentSession(req);
    if (!s) return res.status(401).json({ error: "unauthenticated" });
    res.json({ user: publicUser(s), expiresAt: s.expires_at.getTime() });
  } catch (e) { next(e); }
});

router.post("/logout", async (req, res, next) => {
  try {
    const token = parseCookies(req.headers.cookie)[COOKIE];
    if (token) await db.query("DELETE FROM sessions WHERE token_hash = $1", [sec.sha256(token)]);
    clearCookie(res);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// משתמשי הדגמה למסך הכניסה: רק במצב הדגמה
router.get("/demo", (req, res) => {
  if (!flag("DEMO_MODE")) return res.status(404).json({ error: "not_found" });
  res.json({ users: demo.USERS.map(({ username, password, name, role }) => ({ username, password, name, role })), google: demo.GOOGLE });
});

module.exports = { router, currentSession, SESSION_MS };
