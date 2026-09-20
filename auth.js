/* כניסה למערכת: לקוח מול שרת Rivo (/api/auth/*), שמחובר ל-Neon.
   ההרשאה האמיתית היא עוגיית סשן HttpOnly שהשרת מנפיק ומוסיף לה תוקף מוחלט של 30 דקות.
   ב-sessionStorage נשמרים רק פרטי תצוגה של המשתמש והתוקף (לכותרת ולמילוי טפסים), ונמחקים עם סגירת הלשונית.
   עמוד שמוסיף <script src="auth.js" data-require></script> בראש ה-<head> מועבר למסך הכניסה כשאין משתמש מחובר. */
(function () {
  const KEY = "rivo.auth";
  const GATED = ["home.html", "index.html", "compare.html"]; // עמודים שמותר לחזור אליהם אחרי כניסה

  const parse = (s) => { try { return JSON.parse(s); } catch (e) { return null; } };
  const store = () => { try { return sessionStorage; } catch (e) { return null; } };

  let wasExpired = false; // האם הכניסה שנמצאה פגה (להודעה במסך הכניסה)

  function clearLocal() {
    const st = store(); if (!st) return;
    st.removeItem(KEY);
    // נתוני הלקוחות שנטענו בסשן (קובץ שהועלה, תשובות טפסים) לא נשארים למשתמש הבא
    Object.keys(st).filter((k) => k.startsWith("har")).forEach((k) => st.removeItem(k));
  }
  function cache(user, expiresAt) { const st = store(); if (st) st.setItem(KEY, JSON.stringify({ ...user, expiresAt })); }

  // המשתמש המחובר לפי הזיכרון המקומי (סינכרוני, לתצוגה); השרת הוא מקור האמת
  function user() {
    const st = store(), rec = parse(st && st.getItem(KEY));
    if (!rec) return null;
    if (!Number.isFinite(rec.expiresAt) || Date.now() >= rec.expiresAt) { wasExpired = true; clearLocal(); return null; }
    return rec;
  }
  const remainingMs = () => { const st = store(), rec = parse(st && st.getItem(KEY)); return rec ? Math.max(0, rec.expiresAt - Date.now()) : 0; };

  async function api(path, body) {
    try {
      const r = await fetch("/api/auth/" + path, { method: body === undefined ? "GET" : "POST", credentials: "same-origin", headers: body === undefined ? {} : { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
      let data = {}; try { data = await r.json(); } catch (e) {}
      return { status: r.status, data };
    } catch (e) { return { status: 0, data: {} }; } // אין תקשורת עם השרת
  }

  // בודק מול השרת אם יש סשן תקף ומעדכן את הזיכרון המקומי
  async function validate() {
    const r = await api("me");
    if (r.status === 200) { cache(r.data.user, r.data.expiresAt); return true; }
    if (r.status === 401) { if (store() && store().getItem(KEY)) wasExpired = true; clearLocal(); }
    return false;
  }

  // שלב 1: שם משתמש וסיסמה. בהצלחה השרת מחזיר אתגר OTP (challengeId)
  const login = (username, password) => api("login", { username, password });
  // הרשמה: יוצרת חשבון לא מאומת ושולחת OTP לטלפון; הכניסה מסתיימת ב-verifyOtp
  const register = (fields) => api("register", fields);
  // שלב 2: קוד חד-פעמי. בהצלחה נוצר סשן
  async function verifyOtp(challengeId, code) {
    const r = await api("otp/verify", { challengeId, code });
    if (r.status === 200) cache(r.data.user, r.data.expiresAt);
    return r;
  }
  const resendOtp = (challengeId) => api("otp/resend", { challengeId });
  // Google מדומה (ללא OAuth אמיתי): רק כשהשרת מאפשר זאת
  async function google(account) {
    const r = await api("google", account);
    if (r.status === 200) cache(r.data.user, r.data.expiresAt);
    return r;
  }
  async function demo() { const r = await api("demo"); return r.status === 200 ? r.data : null; }
  async function logout() { await api("logout", {}); clearLocal(); }

  // מעביר רק לעמודים מהרשימה, כדי שפרמטר next לא יוכל להפנות החוצה
  function safeNext(n) {
    try {
      const u = new URL(n, location.href), page = u.pathname.split("/").pop();
      return u.origin === location.origin && GATED.includes(page) ? page + u.search + u.hash : "home.html";
    } catch (e) { return "home.html"; }
  }
  function toLogin(expired) {
    const here = location.pathname.split("/").pop() + location.search + location.hash;
    location.replace("login.html?next=" + encodeURIComponent(here) + (expired ? "&expired=1" : ""));
  }

  let expiryTimer;
  // דף פתוח מועבר למסך הכניסה ברגע שהתוקף פג; בדיקה חוזרת מול השרת גם בחזרה ללשונית
  function watchExpiry() {
    clearTimeout(expiryTimer);
    const left = remainingMs();
    if (left > 0) expiryTimer = setTimeout(async () => { if (!(await validate())) toLogin(true); else watchExpiry(); }, Math.min(left + 100, 2147483000));
    const recheck = async () => { if (!document.hidden && !(await validate())) toLogin(true); };
    document.addEventListener("visibilitychange", recheck);
    window.addEventListener("pageshow", recheck);
  }
  function require() {
    if (user()) {
      watchExpiry();
      validate().then((ok) => { if (!ok) toLogin(true); });
      return true;
    }
    // אין מידע מקומי (למשל לשונית חדשה), אבל ייתכן שהעוגייה תקפה: בודקים מול השרת לפני הפניה
    validate().then((ok) => { if (ok) location.reload(); else toLogin(wasExpired); });
    return false;
  }

  window.RivoAuth = { user, remainingMs, validate, login, register, verifyOtp, resendOtp, google, demo, logout, safeNext, require, wasExpired: () => wasExpired };
  const me = document.currentScript;
  if (me && me.hasAttribute("data-require")) require();
})();
