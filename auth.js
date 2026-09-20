/* כניסה למערכת (הדגמה): משתמשי דמה, חשבונות Google מדומים ושמירת המשתמש המחובר.
   המשתמש נשמר רק ב-sessionStorage (הלשונית הנוכחית) ורק ל-30 דקות מרגע הכניסה; אחר כך נדרשת כניסה מחדש.
   כל הבדיקות רצות בדפדפן בלבד: אין שרת ואין חיבור אמיתי ל-Google.
   עמוד שמוסיף <script src="auth.js" data-require></script> בראש ה-<head> מועבר למסך הכניסה כשאין משתמש מחובר. */
(function () {
  const KEY = "rivo.auth", FAIL_KEY = "rivo.authFail";
  const SESSION_MS = 30 * 60 * 1000; // תוקף הכניסה: חצי שעה מרגע ההתחברות (לא מתחדש בפעילות)
  const GATED = ["home.html", "index.html", "compare.html"]; // עמודים שמותר לחזור אליהם אחרי כניסה

  // משתמשי דמה לכניסה בשם משתמש וסיסמה
  const USERS = [
    { username: "agent", password: "Agent#2026", name: "דנה לוי", role: "סוכנת ביטוח", email: "dana.levi@example.co.il", phone: "0521234567" },
    { username: "alex", password: "Alex#2026", name: "אלכס כהן", role: "לקוח", email: "alex.cohen@example.co.il", idNumber: "012345678", phone: "0548765432" },
    { username: "noa", password: "Noa#2026", name: "נועה ברק", role: "לקוחה", email: "noa.barak@example.co.il", idNumber: "123456789", phone: "0501112233" },
  ];
  // חשבונות Google מדומים שמוצגים בחלון בחירת החשבון
  const GOOGLE_ACCOUNTS = [
    { name: "אלכס כהן", email: "alex.cohen@example.co.il", username: "alex" },
    { name: "דנה לוי", email: "dana.levi@example.co.il", username: "agent" },
  ];

  const parse = (s) => { try { return JSON.parse(s); } catch (e) { return null; } };
  const store = () => { try { return sessionStorage; } catch (e) { return null; } };
  try { localStorage.removeItem(KEY); } catch (e) {} // כניסה שנשמרה בעבר ב-localStorage לא נחשבת ונמחקת

  let wasExpired = false; // האם הכניסה שנמצאה פגה (להודעה במסך הכניסה)
  function user() {
    const st = store(), rec = parse(st && st.getItem(KEY));
    if (!rec) return null;
    // התוקף נגזר מזמן הכניסה עצמו, לא משדה נפרד
    if (!Number.isFinite(rec.at) || Date.now() - rec.at >= SESSION_MS || rec.at > Date.now() + 60000) { wasExpired = true; logout(); return null; }
    return rec;
  }
  function login(u) {
    const rec = { username: u.username, name: u.name, email: u.email || "", role: u.role || "משתמש", provider: u.provider || "password", idNumber: u.idNumber || "", at: Date.now() };
    const st = store(); if (st) st.setItem(KEY, JSON.stringify(rec));
    return rec;
  }
  function logout() {
    const st = store(); if (!st) return;
    st.removeItem(KEY);
    // נתוני הלקוחות שנטענו בסשן (קובץ שהועלה, תשובות טפסים) לא נשארים למשתמש הבא
    Object.keys(st).filter((k) => k.startsWith("har")).forEach((k) => st.removeItem(k));
  }
  const remainingMs = () => { const st = store(), rec = parse(st && st.getItem(KEY)); return rec ? Math.max(0, rec.at + SESSION_MS - Date.now()) : 0; };
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
  // דף פתוח מועבר למסך הכניסה ברגע שהתוקף פג; בדיקה חוזרת גם כשחוזרים ללשונית (טיימרים מואטים ברקע)
  function watchExpiry() {
    clearTimeout(expiryTimer);
    const left = remainingMs();
    if (left > 0) expiryTimer = setTimeout(() => { if (!user()) toLogin(true); else watchExpiry(); }, Math.min(left + 50, 2147483000));
    const recheck = () => { if (!document.hidden && !user()) toLogin(true); };
    document.addEventListener("visibilitychange", recheck);
    window.addEventListener("pageshow", recheck);
  }
  function require() {
    if (user()) { watchExpiry(); return true; }
    toLogin(wasExpired);
    return false;
  }

  // הגנה מפני ניחוש סיסמאות: 5 ניסיונות שגויים נועלים את הכניסה ל-30 שניות
  function failState() { const s = store(); return parse(s && s.getItem(FAIL_KEY)) || { n: 0, until: 0 }; }
  function saveFail(f) { const s = store(); if (s) s.setItem(FAIL_KEY, JSON.stringify(f)); }
  const lockedFor = () => Math.max(0, Math.ceil((failState().until - Date.now()) / 1000));

  function tryPassword(username, password) {
    if (lockedFor() > 0) return { ok: false, locked: lockedFor() };
    const u = USERS.find((x) => x.username === String(username).trim().toLowerCase());
    if (u && u.password === password) { saveFail({ n: 0, until: 0 }); return { ok: true, user: { ...u, provider: "password" } }; }
    const f = failState(); f.n += 1;
    if (f.n >= 5) { f.n = 0; f.until = Date.now() + 30000; }
    saveFail(f);
    return { ok: false, locked: lockedFor(), left: f.until ? 0 : 5 - f.n };
  }

  // קוד חד-פעמי (OTP) מדומה: כניסה בשם משתמש וסיסמה מחייבת אותו אחרי סיסמה נכונה.
  // הקוד נוצר בדפדפן ומוצג כהודעת SMS מדומה; 3 ניסיונות, תוקף של שתי דקות.
  let otp = null;
  function startOtp(u) {
    const code = String(crypto.getRandomValues(new Uint32Array(1))[0] % 1000000).padStart(6, "0");
    otp = { user: u, code, attempts: 0, expires: Date.now() + 120000 };
    return { code, phone: u.phone || "" };
  }
  function verifyOtp(code) {
    if (!otp) return { ok: false, reason: "none" };
    if (Date.now() > otp.expires) { otp = null; return { ok: false, reason: "expired" }; }
    if (code !== otp.code) {
      if (++otp.attempts >= 3) { otp = null; return { ok: false, reason: "locked" }; }
      return { ok: false, reason: "wrong", left: 3 - otp.attempts };
    }
    const u = otp.user; otp = null;
    return { ok: true, user: u };
  }
  const cancelOtp = () => { otp = null; };

  function googleUser(acc) {
    const known = USERS.find((x) => x.username === acc.username);
    if (known) return { ...known, email: acc.email, provider: "google" };
    const local = acc.email.split("@")[0].replace(/[._-]+/g, " ").trim();
    return { username: acc.email, name: acc.name || local.replace(/\b\w/g, (c) => c.toUpperCase()), email: acc.email, role: "משתמש Google", provider: "google" };
  }

  window.RivoAuth = { SESSION_MS, USERS, GOOGLE_ACCOUNTS, user, login, logout, remainingMs, wasExpired: () => wasExpired, require, safeNext, tryPassword, lockedFor, googleUser, startOtp, verifyOtp, cancelOtp };
  const me = document.currentScript;
  if (me && me.hasAttribute("data-require")) require();
})();
