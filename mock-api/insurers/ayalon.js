/* איילון · שירות הצעות מחיר לרכב (מדומה).
   סגנון: camelCase מקונן, התוצאות במערך results, סירוב עם מערך ריק וקוד סיבה. */
(function () {
  const tf = InsurerApi.tf;
  InsurerApi.register({
    id: "ayalon", name: "איילון",
    endpoint: "https://api.ayalon-partners.example/motor/quote/calculate",
    headers: { "X-Ayalon-Key": "demo-ayalon-b47d20" },
    latency: [300, 610], priceBias: 0.96,
    request: {
      style: "camel", layout: "nested", root: "request",
      values: { "driver.whoDrives": tf.map({ any: "open", named: "named" }) },
    },
    response: {
      style: "camel", layout: "nested", root: "results.0", extra: { count: 1 },
      rename: { premiumAnnual: "pricing.annual", premiumMonthly: "pricing.monthly", installments: "pricing.installments", deductible: "terms.deductible", sumInsured: "terms.sumInsured", thirdPartyLimit: "terms.thirdPartyLimit", roadAssist: "terms.roadAssist", replacementDays: "terms.replacementDays", glassIncluded: "terms.glass.included", glassDeductible: "terms.glass.deductible", batteryLimit: "terms.ev.battery", chargerLimit: "terms.ev.charger" },
    },
    rules: [
      { code: "VEHICLE_TOO_OLD", message: "vehicle older than 12 years is not eligible for comprehensive cover", when: (s) => s.coverage.kind === "comprehensive" && new Date().getFullYear() - s.vehicle.year > 12 },
      { code: "HIGH_MILEAGE", message: "annual mileage above 30,000 km", when: (s) => s.usage.mileage === "gt30" },
    ],
    decline: {
      shape: (code, msg) => ({ results: [], count: 0, reasonCode: code, reasonText: msg }),
      read: (j) => ({ code: j.reasonCode, message: j.reasonText }),
    },
  });
})();
