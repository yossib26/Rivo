// חיבור ל-Neon Postgres דרך pg. מחרוזת החיבור נקראת רק מהסביבה (DATABASE_URL) ולעולם לא נשלחת לדפדפן.
const { Pool } = require("pg");

let pool = null;

function connectionString() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL לא מוגדר. העתיקו את .env.example ל-.env והדביקו את מחרוזת החיבור מ-Neon.");
  // sslmode=require מתפרש ב-pg כ-verify-full; מגדירים זאת במפורש כדי להימנע מאזהרה
  return url.replace(/sslmode=(require|prefer|verify-ca)/, "sslmode=verify-full");
}

function getPool() {
  if (!pool) pool = new Pool({ connectionString: connectionString(), max: process.env.VERCEL ? 1 : 5, idleTimeoutMillis: 30000, connectionTimeoutMillis: 10000 });
  return pool;
}

module.exports = {
  query: (text, params) => getPool().query(text, params),
  setPool: (p) => { pool = p; },   // לבדיקות ולריצה עם DB בזיכרון
  close: async () => { if (pool) { await pool.end(); pool = null; } },
};
