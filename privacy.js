/* שכבת פרטיות: משפט אחד ואישור, בתחתית העמוד. מוצגת פעם אחת בכל סשן (לשונית דפדפן).
   האישור נשמר ב-sessionStorage (rivo.privacyAck) ונמחק עם סגירת הלשונית. */
(function () {
  const KEY = "rivo.privacyAck";
  const TEXT = "פרטי החשבון שלך נשמרים בשרת (הסיסמה מגובבת), ואילו נתוני הפוליסות והטפסים נשארים בדפדפן בלבד, ופרטי כרטיס אשראי אינם נשמרים.";
  let memory = null; // גיבוי אם sessionStorage חסום
  const store = {
    get() { try { return sessionStorage.getItem(KEY); } catch (e) { return memory; } },
    set(v) { try { sessionStorage.setItem(KEY, v); } catch (e) { memory = v; } },
  };
  // אישור ישן שנשמר לפי יום ב-localStorage כבר אינו בשימוש
  try { localStorage.removeItem(KEY); } catch (e) {}

  const css = `
  .rivo-privacy-bar { position: fixed; inset-inline: 0; bottom: 0; z-index: 1000; display: flex; align-items: center; justify-content: center; gap: 16px 24px; flex-wrap: wrap; padding: 14px 24px calc(14px + env(safe-area-inset-bottom, 0px)); background: #fff; border-top: 1px solid var(--line, #dfe4ea); box-shadow: 0 -4px 16px rgba(20, 30, 50, .08); color: var(--ink, #1b2733); font-family: inherit; font-size: 15px; line-height: 1.5; }
  .rivo-privacy-bar[hidden] { display: none; }
  .rivo-privacy-bar p { margin: 0; max-width: 62em; }
  .rivo-privacy-bar button { font: inherit; font-weight: 600; padding: 8px 26px; border-radius: 6px; cursor: pointer; border: 1px solid var(--accent, #1f4e8c); background: var(--accent, #1f4e8c); color: #fff; flex: none; }
  .rivo-privacy-bar button:hover { background: var(--hover, #173d6f); border-color: var(--hover, #173d6f); }
  .rivo-privacy-bar button:focus-visible { outline: 3px solid #9fc0e6; outline-offset: 2px; }
  `;

  let bar = null;
  const pad = () => { document.body.style.paddingBottom = bar && !bar.hidden ? bar.offsetHeight + "px" : ""; };

  function ensure() {
    if (bar) return bar;
    const st = document.createElement("style"); st.textContent = css; document.head.appendChild(st);
    bar = document.createElement("div");
    bar.className = "rivo-privacy-bar";
    bar.setAttribute("role", "region");
    bar.setAttribute("aria-label", "פרטיות");
    bar.hidden = true;
    bar.innerHTML = `<p>${TEXT}</p><button type="button">אישור</button>`;
    bar.querySelector("button").addEventListener("click", () => { store.set("1"); bar.hidden = true; pad(); });
    document.body.appendChild(bar);
    window.addEventListener("resize", pad);
    return bar;
  }

  function show() { ensure().hidden = false; pad(); }

  function init() {
    // קישור אופציונלי בעמוד (למשל בתחתית) שמציג את ההודעה שוב
    document.addEventListener("click", (e) => {
      if (e.target.closest("[data-privacy-open]")) { e.preventDefault(); show(); }
    });
    if (store.get() !== "1") show();
  }

  window.RivoPrivacy = { show, acknowledged: () => store.get() === "1" };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
