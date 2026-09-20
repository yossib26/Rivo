/* כותרת האתר המשותפת לכל העמודים (התפריט של עמוד הנחיתה): לוגו, שם, תפריט, כניסה או משתמש מחובר.
   שם האתר מוגדר במקום אחד: BRAND. העיצוב ב-header.css; מצב הכניסה מ-auth.js (אם נטען). */
(function () {
  const BRAND = "Rivo";
  const LOGO = `<svg class="logo" viewBox="0 0 32 32" aria-hidden="true"><rect width="32" height="32" rx="7" fill="#1f4e8c"/><path d="M11 23V9h6.5a4.5 4.5 0 0 1 0 9H11" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/><path d="M17 18l4 5" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round"/><circle cx="23.5" cy="23.5" r="2.2" fill="#9fc0e6"/></svg>`;
  const here = location.pathname.split("/").pop() || "index.html";
  const me = window.RivoAuth && RivoAuth.user();
  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  // אותם קישורי תפריט בכל העמודים; פרקי הנחיתה נפתחים בעמוד הנחיתה
  const items = [["landing.html#steps", "איך זה עובד"], ["landing.html#features", "מה מקבלים"], ["landing.html#faq", "שאלות נפוצות"]];
  if (me) items.push(["home.html", "דף הבית"], ["index.html", "הביטוחים שלי"]);
  else { if (here !== "login.html") items.push(["login.html", "כניסה"]); items.push(["login.html?mode=register", "הרשמה"]); }
  const nav = items.map(([h, t]) => `<a href="${h}"${h === here ? ' aria-current="page"' : ""}>${t}</a>`).join("");

  const initials = me ? me.name.trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join("") : "";
  const userBox = me ? `<div class="site-user"><span class="su-av" aria-hidden="true">${esc(initials)}</span><span class="su-name" title="${esc(me.role)} · ${esc(me.email || me.username)}">${esc(me.name)}</span><button type="button" class="su-out">התנתקות</button></div>` : "";
  const cta = !me && here !== "login.html" ? `<a class="hb" href="home.html">התחילו עכשיו</a>` : "";

  const bar = document.createElement("header");
  bar.className = "site";
  bar.innerHTML = `<div class="hwrap">
    <a class="brand" href="landing.html" aria-label="${BRAND}">${LOGO}<span class="bn">${BRAND}</span></a>
    <nav aria-label="ניווט ראשי" id="mnav">${nav}<div class="nav-extra">${me ? userBox : cta}</div></nav>
    <div class="h-end">${me ? userBox : cta}</div>
    <button class="menu-btn" id="menuBtn" type="button" aria-expanded="false" aria-controls="mnav" aria-label="תפריט"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path id="menuIcon" d="M4 7h16M4 12h16M4 17h16"/></svg></button>
  </div>`;
  document.body.prepend(bar);

  // התנתקות
  bar.querySelectorAll(".su-out").forEach((b) => b.addEventListener("click", async () => { await RivoAuth.logout(); location.href = "login.html"; }));

  // תפריט מובייל: נפתח בכפתור, ונסגר בבחירת קישור, ב-Esc, בלחיצה בחוץ ובמעבר לרוחב דסקטופ
  const btn = bar.querySelector("#menuBtn"), icon = bar.querySelector("#menuIcon");
  const set = (open) => {
    bar.classList.toggle("open", open);
    btn.setAttribute("aria-expanded", String(open));
    icon.setAttribute("d", open ? "M6 6l12 12M18 6L6 18" : "M4 7h16M4 12h16M4 17h16");
  };
  btn.addEventListener("click", () => set(!bar.classList.contains("open")));
  bar.querySelectorAll("nav a").forEach((a) => a.addEventListener("click", () => set(false)));
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") set(false); });
  document.addEventListener("click", (e) => { if (!bar.contains(e.target)) set(false); });
  window.matchMedia("(min-width: 961px)").addEventListener("change", (m) => { if (m.matches) set(false); });

  // אייקון לשונית הדפדפן
  if (!document.querySelector('link[rel="icon"]')) {
    const l = document.createElement("link");
    l.rel = "icon"; l.type = "image/svg+xml"; l.href = "favicon.svg";
    document.head.appendChild(l);
  }
  // שם האתר בסוף כותרת הלשונית, גם כשהעמוד מחליף אותה באופן דינמי
  const suffix = " · " + BRAND, t = document.querySelector("title");
  const apply = () => { if (!document.title.includes(BRAND)) document.title += suffix; };
  apply();
  new MutationObserver(apply).observe(t, { childList: true, characterData: true, subtree: true });
})();
