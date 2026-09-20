// כלי אבטחה: גיבוב סיסמאות (scrypt), HMAC לקודי OTP, טוקנים אקראיים.
const crypto = require("crypto");
const { promisify } = require("util");
const scrypt = promisify(crypto.scrypt);

const N = 16384, R = 8, P = 1, KEYLEN = 64;

async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = await scrypt(password, salt, KEYLEN, { N, r: R, p: P });
  return ["scrypt", N, R, P, salt.toString("base64"), hash.toString("base64")].join("$");
}

async function verifyPassword(password, stored) {
  if (!stored) return false;
  const [alg, n, r, p, salt, hash] = stored.split("$");
  if (alg !== "scrypt") return false;
  const expected = Buffer.from(hash, "base64");
  const actual = await scrypt(password, Buffer.from(salt, "base64"), expected.length, { N: +n, r: +r, p: +p });
  return crypto.timingSafeEqual(expected, actual);
}

// גיבוב בדוי שמריצים כשהמשתמש לא קיים, כדי שזמן התגובה לא יסגיר אם שם המשתמש קיים
let dummy = null;
async function burnTime(password) {
  dummy ||= await hashPassword("timing-equalizer");
  await verifyPassword(password, dummy);
}

const sha256 = (s) => crypto.createHash("sha256").update(s).digest("hex");

function secret() {
  if (!process.env.SESSION_SECRET) throw new Error("SESSION_SECRET לא מוגדר ב-.env");
  return process.env.SESSION_SECRET;
}
const hmac = (s) => crypto.createHmac("sha256", secret()).update(String(s)).digest("hex");

function safeEqual(a, b) {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

const newToken = () => crypto.randomBytes(32).toString("base64url");
const randomCode = () => String(crypto.randomInt(0, 1000000)).padStart(6, "0");

module.exports = { hashPassword, verifyPassword, burnTime, sha256, hmac, safeEqual, newToken, randomCode };
