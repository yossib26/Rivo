/* Loader מעגלי לבדיקת חברות הביטוח — משמש את compare.html ואת loader.html
   InsLoader.run(rootEl, opts) → { stop, seek(fraction 0..1), play(), set(company, status) }
   מצב רגיל: ההתקדמות נקבעת לפי זמן. מצב driven: ההתקדמות נקבעת מבחוץ לפי סטטוס אמיתי של כל חברה,
   באמצעות set("הראל", { state: "load" | "done", kind: "yes" | "no" | "cur", text: "התקבלה הצעה" }). */
(function () {
  const COMPANIES = ["הפניקס", "הראל", "מגדל", "כלל ביטוח", "מנורה מבטחים", "ביטוח ישיר", "שירביט", "הכשרה", "AIG", "איילון"]; // עשר חברות הביטוח הגדולות
  // לוגואים בתיקיית logos/ (נאספו מאתרי החברות ומוויקיפדיה); בהיעדר קובץ מוצגת האות הראשונה
  const LOGOS = { "הפניקס": "phoenix", "הראל": "harel", "מגדל": "migdal", "כלל ביטוח": "clal", "מנורה מבטחים": "menora", "ביטוח ישיר": "yashir", "שירביט": "shirbit", "הכשרה": "hachshara", "AIG": "aig", "איילון": "ayalon" };
  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  function rng(seedStr) {
    let h = 1779033703 ^ seedStr.length;
    for (let i = 0; i < seedStr.length; i++) { h = Math.imul(h ^ seedStr.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); }
    let a = h >>> 0;
    return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }

  const RING_R = 21, RING_C = 2 * Math.PI * RING_R, ORBIT_R = 37;

  function run(root, opts = {}) {
    const o = {
      companies: COMPANIES, duration: 4200, seed: "loader", autoplay: true, onDone: null, doneDelay: 700,
      driven: false, minimal: false, title: "בודקים הצעות מחברות הביטוח", subtitle: "בודקים את עשר חברות הביטוח הגדולות",
      note: "הלוגואים שייכים לחברות הביטוח ומוצגים להדגמה בלבד · ההצעות מדומות", logoBase: "logos/",
      outcome: () => ["yes", "התקבלה הצעה"], // [yes|no|cur, טקסט]
      ...opts,
    };
    const N = o.companies.length, rand = rng(o.seed);
    const raw = o.companies.map((c) => ({ c, s: 0, d: 0.2 + rand() * 0.15 })).map((t, i) => ({ ...t, s: i * 0.065 }));
    const endRaw = Math.max(...raw.map((t) => t.s + t.d));
    const T = raw.map((t) => ({ c: t.c, start: (t.s / endRaw) * o.duration, dur: (t.d / endRaw) * o.duration, get out() { return o.outcome(this.c); } }));
    const reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;

    root.innerHTML = `
      <div class="loader${o.driven ? " driven" : ""}${o.minimal ? " minimal" : ""}">
        <h1>${esc(o.title)}</h1>
        <p class="lsub">${esc(o.subtitle)}</p>
        <div class="orbit">
          <svg viewBox="0 0 100 100" aria-hidden="true">
            <circle class="otrack" cx="50" cy="50" r="${ORBIT_R}"/>
            <circle class="ring-bg" cx="50" cy="50" r="${RING_R}"/>
            <circle class="ring-fg" cx="50" cy="50" r="${RING_R}" stroke-dasharray="${RING_C}" stroke-dashoffset="${RING_C}"/>
          </svg>
          ${T.map((t, i) => `
            <div class="oi wait" data-i="${i}" title="${esc(t.c)}">
              <div class="cicon">${LOGOS[t.c] ? `<img src="${esc(o.logoBase + LOGOS[t.c])}.png" alt="${esc(t.c)}" draggable="false">` : `<span class="cfallback">${esc(t.c[0])}</span>`}<span class="mark">✓</span></div>
              <div class="oname">${esc(t.c)}</div>
            </div>`).join("")}
          <div class="ocenter"><div class="opct">0%</div><div class="ocap">מתחילים…</div></div>
        </div>
        <div class="lbar" role="progressbar" aria-label="התקדמות חיפוש ההצעות" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><div class="lfill"></div></div>
        <div class="lmeta"><span class="ltxt"></span><span class="lpct">0%</span></div>
        <div class="llegend"><span><i class="yes"></i>התקבלה הצעה</span><span><i class="no"></i>לא הוצעה</span><span><i class="cur"></i>הפוליסה הנוכחית</span></div>
        <div class="lnote">${esc(o.note)}</div>
      </div>`;

    // אם קובץ הלוגו חסר — חוזרים לאות הראשונה של שם החברה
    root.querySelectorAll(".cicon img").forEach((img) => img.addEventListener("error", () => {
      const s = document.createElement("span"); s.className = "cfallback"; s.textContent = img.alt[0]; img.replaceWith(s);
    }, { once: true }));
    const q = (s) => root.querySelector(s);
    const icons = [...root.querySelectorAll(".oi")], bar = q(".lbar"), fill = q(".lfill"), ring = q(".ring-fg");
    const state = new Array(N).fill("");
    let raf = 0, timer = 0, finished = false;

    // מצייר את המצב: prs[i] בין 0 (ממתינה) ל-1 (הסתיימה), out(i) = [yes|no|cur, טקסט], last = החברה שהתעדכנה אחרונה
    function paint(prs, out, last) {
      let sum = 0, fin = 0;
      prs.forEach((pr, i) => {
        sum += pr;
        if (pr === 1) fin++;
        const st = pr === 0 ? "wait" : pr < 1 ? "load" : "done " + out(i)[0];
        if (state[i] !== st) { state[i] = st; icons[i].className = "oi " + st; }
      });
      const frac = sum / N, pct = Math.round(frac * 100);
      // האייקונים מקיפים את המעגל בהתאם להתקדמות הטעינה (סיבוב מלא אחד עד 100%)
      const base = reduce ? 0 : frac * 360;
      icons.forEach((ic, i) => {
        const a = ((i * 360) / N + base - 90) * (Math.PI / 180);
        ic.style.left = 50 + ORBIT_R * Math.cos(a) + "%";
        ic.style.top = 50 + ORBIT_R * Math.sin(a) + "%";
      });
      ring.setAttribute("stroke-dashoffset", RING_C * (1 - frac));
      fill.style.width = pct + "%";
      q(".opct").textContent = pct + "%";
      q(".lpct").textContent = pct + "%";
      bar.setAttribute("aria-valuenow", pct);
      const yes = prs.filter((pr, i) => pr === 1 && out(i)[0] === "yes").length;
      q(".ltxt").textContent = `נבדקו ${fin} מתוך ${N} חברות` + (fin === N ? ` · התקבלו ${yes} הצעות` : "");
      q(".ocap").textContent = fin === N ? "הבדיקה הושלמה"
        : last < 0 ? (o.driven ? "ממתינים לתשובות מהשירותים…" : "מתחילים…")
        : state[last].startsWith("done") ? `${T[last].c}: ${out(last)[1]}` : `בודקים את ${T[last].c}`;
      return fin === N;
    }

    // מצב רגיל: הסטטוס נגזר מהזמן שעבר
    function frame(el) {
      let last = -1;
      const prs = T.map((t, i) => { const pr = Math.min(1, Math.max(0, (el - t.start) / t.dur)); if (pr > 0) last = i; return pr; });
      return paint(prs, (i) => T[i].out, last);
    }

    // מצב driven: הסטטוס מגיע מבחוץ
    const ext = T.map(() => ({ state: "wait", kind: "no", text: "" }));
    let lastSet = -1;
    function set(company, st) {
      const i = T.findIndex((t) => t.c === company); if (i < 0) return;
      ext[i] = { ...ext[i], ...st };
      if (st.state === "done" && st.kind !== "cur") lastSet = i; // הכיתוב מציג את התשובה האחרונה שהגיעה
      const done = paint(ext.map((e) => (e.state === "done" ? 1 : e.state === "load" ? 0.001 : 0)), (k) => [ext[k].kind, ext[k].text], lastSet);
      if (done && !finished) { finished = true; if (o.onDone) timer = setTimeout(o.onDone, o.doneDelay); }
    }

    function stop() { cancelAnimationFrame(raf); clearTimeout(timer); }
    function play() {
      stop(); finished = false;
      const t0 = performance.now();
      (function tick() {
        if (frame(performance.now() - t0)) {
          if (!finished) { finished = true; if (o.onDone) timer = setTimeout(o.onDone, o.doneDelay); }
          return;
        }
        raf = requestAnimationFrame(tick);
      })();
    }
    function seek(frac) { stop(); frame(Math.min(1, Math.max(0, frac)) * o.duration); }

    if (o.driven) paint(new Array(N).fill(0), () => ["no", ""], -1);
    else { frame(0); if (o.autoplay) play(); }
    return { stop, play, seek, set };
  }

  window.InsLoader = { COMPANIES, run };
})();
