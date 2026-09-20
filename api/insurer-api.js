/* לקוח API מדומה לשירותי חברות הביטוח.
   כל חברה מוגדרת בקובץ משלה תחת api/insurers/ עם כתובת שירות, כותרות, מבנה בקשה ותגובה (JSON)
   וכללי חיתום משלה. כאן: הלקוח המשותף, הדמיית הרשת והשרת, ומנוע התמחור.

   זרימת קריאה אחת (requestQuote):
     בקשה סטנדרטית → מבנה הבקשה של החברה → "שרת" החברה (חיתום, תמחור, מבנה התגובה שלה)
     → השהיית רשת → JSON חוזר → פענוח לתנאי הצעה אחידים → אובייקט הצעה לתצוגה.
   כל הכתובות הן בדומיין .example השמור לדוגמאות; לא מתבצעת שום קריאת רשת. */
(function () {
  const KIND_LABEL = { comprehensive: "ביטוח רכב מקיף + חובה", third: "ביטוח רכב צד שלישי + חובה", mandatory: "ביטוח רכב חובה" };
  const KIND_SCALE = { comprehensive: 1, third: 0.35, mandatory: 0.22 };
  const STATUS_TEXT = { 200: "OK", 400: "Bad Request", 422: "Unprocessable Entity" };
  const DECLINE_LABELS = {
    YOUNG_DRIVER_NOT_ACCEPTED: "החברה אינה מבטחת נהג צעיר בגיל הזה",
    LOW_LICENCE_SENIORITY: "ותק נהיגה נמוך מהנדרש",
    AT_FAULT_CLAIMS: "היסטוריית תביעות באשמת הנהג",
    PRIOR_CANCELLATION: "סירוב או ביטול פוליסה בעבר",
    BUSINESS_USE: "שימוש עסקי אינו נתמך",
    PRODUCT_NOT_OFFERED: "המוצר המבוקש אינו מוצע בחברה",
    VEHICLE_TOO_OLD: "גיל הרכב חורג מהמותר",
    HIGH_MILEAGE: "קילומטראז׳ שנתי גבוה מהמותר",
    TRAFFIC_CONVICTIONS: "עבירות תנועה חמורות",
    BAD_REQUEST: "הבקשה נדחתה כלא תקינה",
  };

  const nis = (n) => "₪" + Number(n).toLocaleString("en-US", { maximumFractionDigits: 0 });
  const fmtDate = (s) => s.split("-").reverse().join("/");
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  function rng(seedStr) {
    let h = 1779033703 ^ seedStr.length;
    for (let i = 0; i < seedStr.length; i++) { h = Math.imul(h ^ seedStr.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); }
    let a = h >>> 0;
    return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  const hash8 = (s) => (rng(s)() * 4294967296 >>> 0).toString(16).padStart(8, "0");

  /* ---------- נתיבים ומיפוי דו-כיווני בין המודל האחיד למבנה ה-JSON של כל חברה ---------- */
  const getPath = (o, p) => p.split(".").reduce((x, k) => (x == null ? undefined : x[k]), o);
  function setPath(o, p, v) {
    const ks = p.split(".");
    ks.reduce((x, k, i) => {
      if (i === ks.length - 1) { x[k] = v; return x; }
      return (x[k] ??= /^\d+$/.test(ks[i + 1]) ? [] : {});
    }, o);
  }
  const deepMerge = (a, b) => { for (const k of Object.keys(b)) { if (b[k] && typeof b[k] === "object" && !Array.isArray(b[k])) deepMerge((a[k] ??= {}), b[k]); else a[k] = b[k]; } return a; };

  // המרות ערכים שחברות שונות משתמשות בהן
  const tf = {
    agorot: { to: (v) => Math.round(v * 100), from: (v) => v / 100 },
    money2: { to: (v) => Number(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }), from: (v) => parseFloat(String(v).replace(/,/g, "")) },
    yn: { to: (b) => (b ? "Y" : "N"), from: (s) => s === "Y" },
    bit: { to: (b) => (b ? 1 : 0), from: (n) => n === 1 },
    upper: { to: (s) => String(s).toUpperCase(), from: (s) => String(s).toLowerCase() },
    dmy: { to: (iso) => fmtDate(iso).replace(/\//g, "."), from: (s) => s.split(".").reverse().join("-") },
    str: { to: (v) => String(v), from: (v) => Number(v) },
    map: (pairs) => ({ to: (v) => pairs[v] ?? v, from: (v) => Object.keys(pairs).find((k) => pairs[k] === v) ?? v }),
  };

  const STYLE = {
    camel: (s) => s,
    snake: (s) => s.replace(/[A-Z]/g, (m) => "_" + m.toLowerCase()),
    pascal: (s) => s[0].toUpperCase() + s.slice(1),
    upper: (s) => s.replace(/[A-Z]/g, (m) => "_" + m).toUpperCase(),
  };
  function companyPath(p, { style = "camel", layout = "nested" }) {
    const segs = p.split(".").map(STYLE[style]);
    if (layout !== "flat") return segs.join(".");
    if (style === "camel") return segs.map((s, i) => (i ? s[0].toUpperCase() + s.slice(1) : s)).join("");
    if (style === "pascal") return segs.join("");
    return segs.join("_");
  }
  function buildSpec(paths, cfg) {
    return paths.map((p) => [p, (cfg.rename && cfg.rename[p]) || companyPath(p, cfg), cfg.values && cfg.values[p]]);
  }
  const withRoot = (root, p) => (root ? root + "." + p : p);
  function mapOut(src, spec, root) {
    const out = {};
    for (const [std, comp, t] of spec) {
      const v = getPath(src, std);
      if (v === undefined) continue;
      setPath(out, withRoot(root, comp), v !== null && t ? t.to(v) : v);
    }
    return out;
  }
  function mapIn(body, spec, root) {
    const out = {};
    for (const [std, comp, t] of spec) {
      const v = getPath(body, withRoot(root, comp));
      if (v === undefined) continue;
      setPath(out, std, v !== null && t ? t.from(v) : v);
    }
    return out;
  }

  const REQUEST_PATHS = [
    "requestId", "startDate",
    "customer.idNumber", "customer.firstName", "customer.lastName", "customer.phone", "customer.age",
    "vehicle.plate", "vehicle.manufacturer", "vehicle.model", "vehicle.year", "vehicle.engine",
    "driver.licenceYears", "driver.youngestAge", "driver.count", "driver.whoDrives", "driver.claimsCount", "driver.atFault", "driver.priorCancellation", "driver.convictions",
    "usage.type", "usage.mileage", "usage.parking", "usage.security",
    "coverage.kind", "coverage.deductiblePref",
    "prior.insurer", "prior.policyNumber", "prior.annualPremiumNis", "prior.kind", "prior.deductibleNis", "prior.sumInsuredNis",
  ];
  const RESPONSE_PATHS = [
    "quoteId", "kind", "premiumAnnual", "premiumMonthly", "installments", "deductible", "sumInsured", "thirdPartyLimit",
    "roadAssist", "replacementDays", "glassIncluded", "glassDeductible", "batteryLimit", "chargerLimit", "youngDriver", "validUntil",
  ];

  /* ---------- בקשה סטנדרטית (המודל הפנימי) מתשובות האשף ומהפוליסה הנוכחית ---------- */
  function policyKind(p) {
    const t = p.subCategory || "";
    return t.includes("מקיף") ? "comprehensive" : t.includes("צד שלישי") ? "third" : "mandatory";
  }
  function standardRequest(p, a) {
    const av = p.assetDetails || {};
    const cur = p.premium.annualNis ?? p.premium.monthlyNis * 12;
    const mainCov = (p.coverages || []).find((c) => c.deductibleNis != null) || (p.coverages || []).find((c) => c.sumInsuredNis != null);
    const hadClaims = a.hadClaims === "yes";
    const key = [p.policyId, a.idNumber, a.mainAge, a.youngestAge, a.licenceYears, a.driversCount, a.whoDrives, a.hadClaims, a.claimsCount, a.atFault, a.cancelled, a.convictions, a.usage, a.mileage, a.parking, a.security, a.deductible, a.startDate].join("|");
    return {
      requestId: "RQ-" + hash8(key + "|" + a.coverage),
      startDate: a.startDate,
      customer: { idNumber: a.idNumber, firstName: a.firstName, lastName: a.lastName, phone: a.phone, age: +a.mainAge },
      vehicle: { plate: av.licensePlate || "", manufacturer: av.vehicleManufacturer || "", model: av.vehicleModel || "", year: +av.modelYear || 0, engine: av.engineType || "GASOLINE" },
      driver: {
        licenceYears: +a.licenceYears, youngestAge: +a.youngestAge, count: +a.driversCount, whoDrives: a.whoDrives,
        claimsCount: hadClaims ? +a.claimsCount || 1 : 0, atFault: hadClaims && a.atFault === "yes",
        priorCancellation: a.cancelled === "yes", convictions: a.convictions === "yes",
      },
      usage: { type: a.usage, mileage: a.mileage, parking: a.parking, security: !!a.security },
      coverage: { kind: a.coverage, deductiblePref: a.deductible },
      prior: { insurer: p.insuranceCompany, policyNumber: p.policyId, annualPremiumNis: cur, kind: policyKind(p), deductibleNis: mainCov?.deductibleNis, sumInsuredNis: mainCov?.sumInsuredNis },
    };
  }
  // מפתח יציב לבקשה בלי סוג הכיסוי ומזהה הבקשה (לזיהוי שינוי בתשובות האשף)
  const requestSignature = (std) => JSON.stringify({ ...std, requestId: undefined, coverage: { ...std.coverage, kind: undefined } });

  /* ---------- גורמי סיכון: משפיעים על המחיר אצל כל החברות ---------- */
  function risk(std) {
    const F = [], add = (label, delta) => F.push({ label, delta });
    const d = std.driver, u = std.usage, kind = std.coverage.kind;
    const y = d.youngestAge, l = d.licenceYears;
    if (y < 21) add("נהג צעיר מאוד (מתחת ל-21)", 0.35); else if (y < 24) add("נהג צעיר (מתחת ל-24)", 0.22); else if (y < 30) add("נהג צעיר (מתחת ל-30)", 0.08);
    if (l < 2) add("ותק נהיגה נמוך מ-2 שנים", 0.2); else if (l < 5) add("ותק נהיגה נמוך מ-5 שנים", 0.08); else if (l >= 15) add("ותק נהיגה גבוה (15+ שנים)", -0.05);
    if (d.claimsCount > 0) {
      add(`${d.claimsCount} תביעות ב-3 השנים האחרונות`, 0.1 * Math.min(d.claimsCount, 3));
      if (d.atFault) add("תביעה באשמת הנהג", 0.08);
    } else add("ללא תביעות ב-3 השנים האחרונות", -0.05);
    if (d.priorCancellation) add("סירוב / ביטול פוליסה בעבר", 0.1);
    if (d.convictions) add("עבירות תנועה חמורות", 0.1);
    if (u.type === "business") add("שימוש גם לעבודה", 0.1);
    if (u.mileage === "gt30") add("קילומטראז׳ שנתי גבוה", 0.08); else if (u.mileage === "20-30") add("קילומטראז׳ שנתי מעל הממוצע", 0.03); else if (u.mileage === "lt10") add("קילומטראז׳ שנתי נמוך", -0.04);
    if (kind !== "mandatory") {
      if (u.parking === "street") add("חניה ברחוב", 0.06); else if (u.parking === "garage") add("חניה סגורה", -0.04);
      if (std.coverage.deductiblePref === "high") add("השתתפות עצמית גבוהה", -0.06); else if (std.coverage.deductiblePref === "low") add("השתתפות עצמית נמוכה", 0.06);
    }
    if (kind === "comprehensive" && u.security) add("מערכת מיגון / איתור", -0.04);
    return { F, total: Math.min(1.9, Math.max(0.7, 1 + F.reduce((s, x) => s + x.delta, 0))) };
  }

  /* ---------- תנאי ההצעה (מודל אחיד שכל חברה מנסחת ב-JSON משלה) ---------- */
  function makeTerms(std, def) {
    const kind = std.coverage.kind, rand = rng(std.prior.policyNumber + kind + def.id);
    const pick = (arr) => arr[Math.floor(rand() * arr.length)];
    const base = (std.prior.annualPremiumNis * KIND_SCALE[kind]) / KIND_SCALE[std.prior.kind];
    const annual = Math.round((base * risk(std).total * def.priceBias * (0.88 + rand() * 0.24)) / 10) * 10;
    const dMul = { low: 0.6, std: 1, high: 1.6 }[std.coverage.deductiblePref] || 1;
    const full = kind !== "mandatory";
    const t = {
      quoteId: def.id.toUpperCase() + "-" + hash8(std.requestId + def.id).toUpperCase(),
      kind, premiumAnnual: annual, premiumMonthly: Math.round(annual / 12), installments: pick([6, 10, 12]),
      deductible: full ? Math.round(((std.prior.deductibleNis ?? 1500) * dMul * (0.85 + rand() * 0.4)) / 50) * 50 : null,
      sumInsured: kind === std.prior.kind ? std.prior.sumInsuredNis ?? null : null,
      thirdPartyLimit: full ? pick([1000000, 2000000]) : null,
      roadAssist: full && rand() > 0.3, replacementDays: 0, glassIncluded: full && rand() > 0.3, glassDeductible: null,
      batteryLimit: null, chargerLimit: null, youngDriver: "none", validUntil: null,
    };
    if (full) {
      const alt = rand() > 0.3; t.replacementDays = alt ? pick([7, 14, 30]) : 0;
      t.glassDeductible = t.glassIncluded ? pick([0, 250, 400]) : null;
      if (std.vehicle.engine === "ELECTRIC") {
        const bat = rand() > 0.4, chg = rand() > 0.5;
        t.batteryLimit = bat ? pick([40000, 60000]) : 0; t.chargerLimit = chg ? pick([10000, 15000]) : 0;
      }
    }
    if (std.driver.youngestAge < 24) t.youngDriver = pick(["surcharge", "deductible"]);
    const until = new Date(); until.setDate(until.getDate() + 14); t.validUntil = until.toISOString().slice(0, 10);
    return t;
  }

  /* ---------- תיאור קריא של ההצעה לתצוגה ---------- */
  function describe(t, std) {
    const rows = [], add = (label, v, k = "info") => rows.push({ label, v, k });
    const full = t.kind !== "mandatory";
    add("סוג הפוליסה", KIND_LABEL[t.kind]);
    if (t.kind === "comprehensive") {
      add("נזק עצמי (תאונה / גניבה / שריפה)", "כלול", "yes");
      add("סכום ביטוח", t.sumInsured != null ? nis(t.sumInsured) : "לפי שווי הרכב במחירון");
    }
    if (full) {
      add("אחריות צד ג׳ (רכוש)", "עד " + nis(t.thirdPartyLimit), "yes");
      add("השתתפות עצמית", nis(t.deductible));
      if (std.driver.youngestAge < 24) add("השתתפות עצמית לנהג צעיר", "תוספת " + nis(Math.round((t.deductible * 0.5) / 50) * 50));
    }
    add("חובה – נזקי גוף", "לפי חוק הפלת״ד, ללא הגבלת סכום", "yes");
    if (full) {
      add("שירותי דרך וגרירה", t.roadAssist ? "כלול – גרירה, פנצ׳ר, התנעה ופתיחת רכב" : "לא כלול (ניתן להוסיף בתשלום)", t.roadAssist ? "yes" : "no");
      add("רכב חלופי", t.replacementDays ? `כלול עד ${t.replacementDays} ימים` : "לא כלול", t.replacementDays ? "yes" : "no");
      add("שבר שמשות ופנסים", t.glassIncluded ? `כלול · השתתפות עצמית ${nis(t.glassDeductible)}` : "לא כלול", t.glassIncluded ? "yes" : "no");
      if (t.batteryLimit !== null) add("סוללת רכב חשמלי", t.batteryLimit ? `כלול עד ${nis(t.batteryLimit)}` : "לא כלול", t.batteryLimit ? "yes" : "no");
      if (t.chargerLimit !== null) add("עמדת טעינה וכבל", t.chargerLimit ? `כלול עד ${nis(t.chargerLimit)}` : "לא כלול", t.chargerLimit ? "yes" : "no");
    }
    add("מי רשאי לנהוג", std.driver.whoDrives === "any" ? "כל נהג" : `${std.driver.count} נהגים מוגדרים`);
    add("נהג צעיר", { none: "ללא תוספת", surcharge: "כלול בתוספת פרמיה", deductible: "כלול בהשתתפות עצמית מוגדלת" }[t.youngDriver]);
    const end = new Date(std.startDate); end.setFullYear(end.getFullYear() + 1);
    add("תקופת הביטוח", `12 חודשים · ${fmtDate(std.startDate)} – ${fmtDate(end.toISOString().slice(0, 10))}`);
    add("תשלום", `עד ${t.installments} תשלומים ללא ריבית`);
    add("ביטול הפוליסה", "בכל עת, עם החזר יחסי");
    add("הצעה בתוקף עד", fmtDate(t.validUntil));
    add("מספר הצעה", t.quoteId);
    return rows;
  }

  function toOffer(name, t, std) {
    const full = t.kind !== "mandatory";
    return {
      company: name, quoteId: t.quoteId, annual: t.premiumAnnual, monthly: t.premiumMonthly, sum: t.sumInsured, deductible: t.deductible,
      extras: full ? [["שירותי דרך וגרירה", t.roadAssist], ["רכב חלופי", t.replacementDays > 0], ["שבר שמשות ופנסים", t.glassIncluded]] : [],
      details: describe(t, std), terms: t,
    };
  }

  /* ---------- רישום חברה ומימוש ה"שרת" שלה ---------- */
  const registry = new Map();
  function register(def) {
    def.reqSpec = buildSpec(REQUEST_PATHS, def.request);
    def.respSpec = buildSpec(RESPONSE_PATHS, def.response);
    def.headers = { Accept: "application/json", ...(def.headers || {}) };
    registry.set(def.name, def);
  }

  // צד השרת של החברה: מפענח את הבקשה שלה, מחתים, מתמחר ומנסח תגובה במבנה שלה
  function serve(def, body) {
    const inner = def.request.unwrap ? def.request.unwrap(body) : body;
    const std = mapIn(inner, def.reqSpec, def.request.root);
    if (!/^\d{9}$/.test(std.customer?.idNumber || "")) return { status: 400, body: def.decline.shape("BAD_REQUEST", "customer id is missing or malformed") };
    for (const r of def.rules) if (r.when(std)) return { status: 422, body: def.decline.shape(r.code, r.message) };
    const terms = makeTerms(std, def);
    let out = mapOut(terms, def.respSpec, def.response.root);
    if (def.response.extra) deepMerge(out, typeof def.response.extra === "function" ? def.response.extra(terms, std) : def.response.extra);
    if (def.response.wrap) out = def.response.wrap(out, std);
    return { status: 200, body: out };
  }

  async function requestQuote(name, std) {
    const def = registry.get(name);
    if (!def) throw new Error("no API registered for " + name);
    let body = mapOut(std, def.reqSpec, def.request.root);
    if (def.request.extra) deepMerge(body, def.request.extra);
    if (def.request.wrap) body = def.request.wrap(body, std);
    const request = { method: "POST", url: def.endpoint, headers: { ...def.headers, "Content-Type": "application/json", "X-Request-Id": std.requestId }, body };
    const t0 = performance.now();
    const server = serve(def, JSON.parse(JSON.stringify(request.body))); // הבקשה עוברת כ-JSON, כמו ברשת
    const [lo, hi] = def.latency;
    await sleep(lo + rng(std.requestId + def.id)() * (hi - lo));
    const wire = JSON.stringify(server.body);
    const json = JSON.parse(wire);
    const exchange = {
      request,
      response: { status: server.status, statusText: STATUS_TEXT[server.status] || "", latencyMs: Math.round(performance.now() - t0), headers: { "Content-Type": "application/json", "Content-Length": String(wire.length) }, body: json },
    };
    if (server.status === 200) {
      const inner = def.response.unwrap ? def.response.unwrap(json) : json;
      const terms = mapIn(inner, def.respSpec, def.response.root);
      return { company: name, ok: true, offer: toOffer(name, terms, std), exchange };
    }
    const d = def.decline.read(json);
    return { company: name, ok: false, decline: { code: d.code, message: d.message, label: DECLINE_LABELS[d.code] || d.code }, exchange };
  }

  window.InsurerApi = {
    register, requestQuote, standardRequest, requestSignature, risk, tf, rng, KIND_LABEL, DECLINE_LABELS,
    names: () => [...registry.keys()], has: (n) => registry.has(n), definition: (n) => registry.get(n),
    _internal: { mapOut, mapIn, serve, makeTerms },
  };
})();
