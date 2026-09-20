/* חברות הביטוח מהטבלה insurers ב-DB (GET /api/insurers), עם שמירה בזיכרון.
   Insurers.load() → [{ id, name, logo, website, apiEndpoint }]. אם השרת לא זמין, ברירת מחדל מקומית (fallback: true). */
(function () {
  const FALLBACK = [["phoenix", "הפניקס"], ["harel", "הראל"], ["migdal", "מגדל"], ["clal", "כלל ביטוח"], ["menora", "מנורה מבטחים"], ["yashir", "ביטוח ישיר"], ["shirbit", "שירביט"], ["hachshara", "הכשרה"], ["aig", "AIG"], ["ayalon", "איילון"]]
    .map(([id, name]) => ({ id, name, logo: `logos/${id}.png`, website: "", apiEndpoint: "", fallback: true }));
  let pending = null;

  function load() {
    pending ||= fetch("/api/insurers", { credentials: "same-origin" })
      .then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then((d) => (Array.isArray(d.insurers) && d.insurers.length ? d.insurers : FALLBACK))
      .catch(() => FALLBACK);
    return pending;
  }
  // שם חברה → נתיב הלוגו שלה (לרכיב ה-loader)
  const logos = (list) => Object.fromEntries(list.filter((x) => x.logo).map((x) => [x.name, x.logo]));

  window.Insurers = { load, logos };
})();
