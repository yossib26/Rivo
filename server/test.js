// בדיקות שרת: כניסה, OTP, סשן, נעילת עמודים והסתרת קבצים.
// npm test  → מסד בזיכרון (pg-mem).   TEST_DB=neon npm test  → נגד Neon האמיתי (דורש DATABASE_URL ב-.env).
require("dotenv").config();
const assert = require("assert");
const db = require("./db");
const sec = require("./security");
const { setup, seedInsurers } = require("./setup-db");

const useNeon = process.env.TEST_DB === "neon";
process.env.DEMO_MODE = "1";
process.env.ALLOW_MOCK_GOOGLE = "1";
process.env.SESSION_SECRET ||= "test-secret";
if (!useNeon) { const { newDb } = require("pg-mem"); db.setPool(new (newDb().adapters.createPg().Pool)()); }
const { createApp } = require("./index");

let passed = 0;
const ok = (cond, name) => { assert.ok(cond, name); passed++; console.log("  ✓", name); };

(async () => {
  await setup(() => {});
  const server = createApp().listen(0);
  const base = `http://localhost:${server.address().port}`;
  const call = async (path, { method = "GET", body, cookie, headers = {} } = {}) => {
    const r = await fetch(base + path, { method, redirect: "manual", headers: { ...(body ? { "Content-Type": "application/json" } : {}), ...(cookie ? { Cookie: cookie } : {}), ...headers }, body: body ? JSON.stringify(body) : undefined });
    let json = null; try { json = await r.clone().json(); } catch (e) {}
    return { status: r.status, json, headers: r.headers, cookie: (r.headers.get("set-cookie") || "").split(";")[0], raw: r.headers.get("set-cookie") || "" };
  };
  const login = (u, p) => call("/api/auth/login", { method: "POST", body: { username: u, password: p } });
  const verify = (id, code, cookie) => call("/api/auth/otp/verify", { method: "POST", body: { challengeId: id, code }, cookie });
  console.log(`DB: ${useNeon ? "Neon" : "pg-mem (זיכרון)"}`);

  console.log("נעילת עמודים ונתונים");
  let r = await call("/home.html");
  ok(r.status === 302 && r.headers.get("location").startsWith("/login.html?next="), "בלי סשן: עמוד מוגן מועבר למסך הכניסה");
  r = await call("/compare.html?file=data.json&policy=X");
  ok(decodeURIComponent(r.headers.get("location")).includes("compare.html?file=data.json&policy=X"), "הכתובת המבוקשת נשמרת בפרמטר next");
  ok((await call("/data.json")).status === 401 && (await call("/data2.json")).status === 401, "בלי סשן: קבצי נתונים מחזירים 401");
  ok((await call("/landing.html")).status === 200 && (await call("/login.html")).status === 200 && (await call("/logos/harel.png")).status === 200, "עמודים ציבוריים ונכסים מוגשים");
  for (const p of ["/server/index.js", "/server/auth.js", "/db/schema.sql", "/package.json", "/.env", "/.gitignore", "/node_modules/pg/package.json"]) ok((await call(p)).status === 404, `לא מוגש: ${p}`);

  console.log("טבלת חברות הביטוח");
  r = await call("/api/insurers");
  ok(r.status === 200 && r.json.insurers.length === 10, "הרשימה נטענת מהטבלה (בלי סשן) ובה 10 חברות");
  ok(r.json.insurers[0].name === "הפניקס" && r.json.insurers[9].name === "איילון", "הסדר לפי sort_order");
  ok(r.json.insurers.every((x) => x.id && x.name && x.logo && x.apiEndpoint.startsWith("https://") && x.website.startsWith("https://")), "לכל חברה מזהה, לוגו, אתר וכתובת שירות");
  let logosOk = true; for (const x of r.json.insurers) if ((await call("/" + x.logo)).status !== 200) logosOk = false;
  ok(logosOk, "כל הלוגואים שברשימה קיימים ומוגשים");
  await seedInsurers(() => {});
  ok((await db.query("SELECT count(*) AS n FROM insurers")).rows[0].n * 1 === 10, "הרצה חוזרת של ההגדרה לא מכפילה חברות");
  await db.query("UPDATE insurers SET active = FALSE WHERE id = 'aig'");
  r = await call("/api/insurers");
  ok(r.json.insurers.length === 9 && !r.json.insurers.some((x) => x.id === "aig"), "חברה לא פעילה לא מוצגת");
  await db.query("UPDATE insurers SET active = TRUE WHERE id = 'aig'");
  await db.query("UPDATE insurers SET sort_order = 99 WHERE id = 'phoenix'");
  r = await call("/api/insurers");
  ok(r.json.insurers[9].id === "phoenix", "שינוי sort_order ב-DB משנה את הסדר");
  await db.query("UPDATE insurers SET sort_order = 1 WHERE id = 'phoenix'");

  console.log("כניסה בשם משתמש וסיסמה");
  ok((await call("/api/auth/login", { method: "POST", body: { username: "alex" } })).status === 400, "בקשה חסרה נדחית");
  ok((await call("/api/auth/login", { method: "POST", body: "x", headers: { "Content-Type": "text/plain" } })).status === 415, "בקשה שאינה JSON נדחית");
  ok((await call("/api/auth/login", { method: "POST", body: { username: "alex", password: "x" }, headers: { Origin: "https://evil.example" } })).status === 403, "בקשה ממקור זר נדחית");
  r = await login("alex", "wrong");
  ok(r.status === 401 && r.json.left === 4, "סיסמה שגויה: 401 ונותרו 4 ניסיונות");
  r = await login("nobody", "wrong");
  ok(r.status === 401 && r.json.left === 4, "משתמש לא קיים מקבל את אותה תגובה בדיוק");
  for (let i = 0; i < 3; i++) await login("noa", "bad");
  ok((await login("noa", "bad")).json.left === 1, "ספירת ניסיונות שגויים נשמרת ב-DB");
  r = await login("noa", "bad");
  ok(r.status === 429 && r.json.error === "locked" && r.json.retryAfter > 0, "5 כישלונות נועלים את המשתמש");
  ok((await login("noa", "Noa#2026")).status === 429, "גם סיסמה נכונה נדחית בזמן הנעילה");
  await db.query("UPDATE users SET failed_attempts = 0, locked_until = NULL WHERE username = 'noa'");

  console.log("OTP וסשן");
  r = await login("alex", "Alex#2026");
  ok(r.status === 200 && r.json.challengeId && r.json.demoCode && /^\d{6}$/.test(r.json.demoCode) && r.json.phoneMasked === "054-***-5432", "סיסמה נכונה: אתגר OTP ומספר טלפון מוסתר");
  ok(!r.cookie, "אין סשן לפני אימות ה-OTP");
  const first = r.json;
  const row = (await db.query("SELECT code_hash FROM login_challenges WHERE id = $1", [first.challengeId])).rows[0];
  ok(row.code_hash !== first.demoCode && row.code_hash.length === 64, "הקוד נשמר כ-HMAC ולא כטקסט");
  r = await verify(first.challengeId, first.demoCode === "000000" ? "111111" : "000000");
  ok(r.status === 400 && r.json.error === "wrong" && r.json.left === 2, "קוד שגוי: נותרו 2 ניסיונות");
  await verify(first.challengeId, "111111"); r = await verify(first.challengeId, "222222");
  ok(r.json.error === "locked", "3 קודים שגויים נועלים את האתגר");
  ok((await verify(first.challengeId, first.demoCode)).status === 400, "הקוד הנכון לא עובד אחרי נעילת האתגר");
  r = await call("/api/auth/otp/resend", { method: "POST", body: { challengeId: first.challengeId } });
  ok(r.status === 200 && r.json.challengeId !== first.challengeId, "אחרי נעילה אפשר לבקש קוד חדש");
  const second = r.json;
  r = await call("/api/auth/otp/resend", { method: "POST", body: { challengeId: second.challengeId } });
  ok(r.status === 429 && r.json.error === "too_soon", "בקשת קוד חדש מהירה מדי נדחית");
  ok((await verify(first.challengeId, first.demoCode)).status === 400, "האתגר הישן הוחלף ואינו תקף");
  r = await verify(second.challengeId, second.demoCode);
  ok(r.status === 200 && r.json.user.username === "alex" && r.json.user.name === "אלכס כהן" && r.json.user.idNumber === "012345678", "קוד נכון: כניסה והחזרת פרטי המשתמש");
  const cookie = r.cookie, setCookie = r.raw;
  ok(/HttpOnly/.test(setCookie) && /SameSite=Lax/.test(setCookie), "עוגיית הסשן HttpOnly ו-SameSite=Lax");
  ok(!/Max-Age|Expires/i.test(setCookie), "העוגייה ברמת סשן דפדפן (בלי Max-Age)");
  const drift = r.json.expiresAt - Date.now();
  ok(drift > 29.9 * 60000 && drift <= 30 * 60000, "התוקף שמוחזר הוא 30 דקות");
  const tokenHash = (await db.query("SELECT token_hash FROM sessions")).rows.map((x) => x.token_hash);
  ok(tokenHash.includes(sec.sha256(cookie.split("=")[1])) && !tokenHash.includes(cookie.split("=")[1]), "ב-DB נשמר רק ה-SHA-256 של הטוקן");
  ok((await db.query("SELECT password_hash FROM users WHERE username = 'alex'")).rows[0].password_hash.startsWith("scrypt$"), "הסיסמה שמורה כ-scrypt");

  console.log("שימוש בסשן");
  r = await call("/api/auth/me", { cookie });
  ok(r.status === 200 && r.json.user.name === "אלכס כהן", "/api/auth/me מחזיר את המשתמש");
  ok((await call("/home.html", { cookie })).status === 200 && (await call("/index.html", { cookie })).status === 200, "עמודי האפליקציה נפתחים עם סשן");
  r = await call("/data.json", { cookie });
  ok(r.status === 200 && r.json.policies.length > 0, "קבצי הנתונים נפתחים עם סשן");
  ok((await call("/api/auth/me", { cookie: "rivo_session=forged" })).status === 401, "טוקן מזויף נדחה");
  await db.query("UPDATE sessions SET expires_at = $1 WHERE token_hash = $2", [new Date(Date.now() - 1000), sec.sha256(cookie.split("=")[1])]);
  ok((await call("/api/auth/me", { cookie })).status === 401 && (await call("/home.html", { cookie })).status === 302, "אחרי 30 דקות הסשן פג ונדרשת כניסה מחדש");

  console.log("התנתקות ו-Google מדומה");
  r = await call("/api/auth/login", { method: "POST", body: { username: "agent", password: "Agent#2026" } });
  r = await verify(r.json.challengeId, r.json.demoCode);
  const c2 = r.cookie;
  r = await call("/api/auth/logout", { method: "POST", body: {}, cookie: c2 });
  ok(r.status === 200 && /Max-Age=0/.test(r.raw), "התנתקות מנקה את העוגייה");
  ok((await call("/api/auth/me", { cookie: c2 })).status === 401, "אחרי התנתקות הסשן נמחק מה-DB");
  r = await call("/api/auth/google", { method: "POST", body: { email: "dana.levi@example.co.il" } });
  ok(r.status === 200 && r.json.user.name === "דנה לוי" && r.cookie, "Google מדומה: כניסה למשתמש קיים לפי דוא״ל, בלי OTP");
  r = await call("/api/auth/google", { method: "POST", body: { email: "new.user@example.com" } });
  ok(r.status === 200 && r.json.user.provider === "google" && r.json.user.name === "New User", "Google מדומה: משתמש חדש נוצר ב-DB");
  ok((await call("/api/auth/google", { method: "POST", body: { email: "bad" } })).status === 400, "דוא״ל לא תקין נדחה");
  console.log("הרשמה עם שם משתמש וסיסמה");
  const reg = (b) => call("/api/auth/register", { method: "POST", body: b });
  const good = { name: "בדיקה ראשונה", username: "tester.one", password: "Passw0rdX1", phone: "0501234567", email: "tester.one@gmail.com", idNumber: "123456782" };
  for (const [patch, field, label] of [[{ username: "A" }, "username", "שם משתמש קצר"], [{ username: "Bad Name" }, "username", "שם משתמש עם רווח ואותיות גדולות"], [{ password: "short1" }, "password", "סיסמה קצרה"], [{ password: "onlyletters" }, "password", "סיסמה בלי ספרה"], [{ password: "xTester.one1" }, "password", "סיסמה שכוללת את שם המשתמש"], [{ phone: "0412345678" }, "phone", "טלפון לא נייד"], [{ email: "nope" }, "email", "דוא״ל לא תקין"], [{ idNumber: "12" }, "idNumber", "ת״ז לא תקינה"], [{ name: "x" }, "name", "שם קצר"]]) {
    r = await reg({ ...good, ...patch });
    ok(r.status === 400 && r.json.field === field, `הרשמה נדחית: ${label}`);
  }
  r = await reg(good);
  ok(r.status === 200 && r.json.purpose === "register" && /^\d{6}$/.test(r.json.demoCode) && r.json.phoneMasked === "050-***-4567" && !r.cookie, "הרשמה תקינה: אתגר OTP לטלפון ועדיין אין סשן");
  const regCh = r.json;
  const created = (await db.query("SELECT verified, provider, role, id_number, password_hash FROM users WHERE username = 'tester.one'")).rows[0];
  ok(created.verified === false && created.role === "לקוח" && created.id_number === "123456782" && created.password_hash.startsWith("scrypt$"), "החשבון נוצר כלא מאומת, עם סיסמה מגובבת");
  ok((await login("tester.one", good.password)).status === 401, "אי אפשר להיכנס לפני אימות הטלפון");
  r = await verify(regCh.challengeId, regCh.demoCode === "000000" ? "111111" : "000000");
  ok(r.status === 400 && r.json.left === 2, "אימות טלפון עם קוד שגוי נדחה");
  r = await verify(regCh.challengeId, regCh.demoCode);
  ok(r.status === 200 && r.json.user.username === "tester.one" && r.json.user.role === "לקוח" && r.json.user.idNumber === "123456782" && r.cookie, "אימות הטלפון משלים את ההרשמה ומחבר");
  ok((await db.query("SELECT verified FROM users WHERE username = 'tester.one'")).rows[0].verified === true, "החשבון סומן כמאומת");
  ok((await call("/home.html", { cookie: r.cookie })).status === 200, "המשתמש החדש נכנס לעמודי האפליקציה");
  r = await reg({ ...good, email: "other@gmail.com" });
  ok(r.status === 409 && r.json.error === "username_taken", "שם משתמש תפוס נדחה");
  r = await reg({ ...good, username: "tester.two" });
  ok(r.status === 409 && r.json.error === "email_taken", "דוא״ל רשום נדחה");
  r = await reg({ ...good, username: "tester.two", email: "tester.two@gmail.com", phone: "0507654321" });
  ok(r.status === 200, "הרשמה שנייה (לא מאומתת)");
  r = await reg({ ...good, username: "tester.two", email: "tester.two@gmail.com", phone: "0507654321", password: "Different9pass" });
  ok(r.status === 200 && (await db.query("SELECT 1 FROM users WHERE username = 'tester.two'")).rows.length === 1, "ניסיון חוזר עם אותו שם משתמש מחליף הרשמה שלא אומתה");
  // המשתמש שנרשם נכנס בכל כניסה עתידית עם סיסמה ו-OTP
  r = await login("tester.one", good.password);
  ok(r.status === 200 && r.json.demoCode, "אחרי ההרשמה: כניסה בסיסמה מחייבת OTP");
  r = await verify(r.json.challengeId, r.json.demoCode);
  ok(r.status === 200 && r.json.user.name === "בדיקה ראשונה", "כניסה מלאה של המשתמש החדש");
  // Google מדומה לא נותן גישה לחשבון שנרשם עם סיסמה
  r = await call("/api/auth/google", { method: "POST", body: { email: "tester.one@gmail.com" } });
  ok(r.status === 409 && r.json.error === "use_password" && !r.cookie, "Google מדומה נחסם לחשבון שנרשם עם סיסמה");
  r = await call("/api/auth/google", { method: "POST", body: { email: "fresh.person@gmail.com", name: "אדם חדש" } });
  ok(r.status === 200 && r.json.user.provider === "google" && r.json.user.name === "אדם חדש" && r.cookie, "הרשמה עם Gmail (Google מדומה) יוצרת משתמש ומחברת");
  r = await call("/api/auth/google", { method: "POST", body: { email: "fresh.person@gmail.com" } });
  ok(r.status === 200 && r.json.user.name === "אדם חדש", "כניסה חוזרת עם אותו חשבון Google");

  process.env.ALLOW_MOCK_GOOGLE = "0";
  ok((await call("/api/auth/google", { method: "POST", body: { email: "dana.levi@example.co.il" } })).status === 403, "כש-ALLOW_MOCK_GOOGLE כבוי הנתיב חסום");
  process.env.DEMO_MODE = "0";
  ok((await call("/api/auth/demo")).status === 404, "כש-DEMO_MODE כבוי משתמשי הדמה לא נחשפים");

  await db.query("DELETE FROM users WHERE email IN ('new.user@example.com', 'fresh.person@gmail.com', 'tester.one@gmail.com', 'tester.two@gmail.com')");
  server.close(); await db.close();
  console.log(`\nעברו ${passed} בדיקות`);
})().catch(async (e) => { console.error("\nנכשל:", e.message); try { await db.close(); } catch (x) {} process.exit(1); });
