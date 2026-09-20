/* שירביט · שירות הצעות מחיר לרכב (מדומה).
   סגנון: camelCase שטוח, סכומים כמחרוזות מספריות, דגלים 0/1. */
(function () {
  const tf = InsurerApi.tf;
  const amounts = ["premiumAnnual", "premiumMonthly", "deductible", "sumInsured", "thirdPartyLimit", "glassDeductible", "batteryLimit", "chargerLimit"];
  InsurerApi.register({
    id: "shirbit", name: "שירביט",
    endpoint: "https://online.shirbit-ins.example/api/motor/offers",
    headers: { "X-Shirbit-Key": "demo-shirbit-02f6b8" },
    latency: [290, 600], priceBias: 0.95,
    request: {
      style: "camel", layout: "flat",
      values: { "driver.atFault": tf.bit, "driver.priorCancellation": tf.bit, "driver.convictions": tf.bit, "usage.security": tf.bit },
    },
    response: {
      style: "camel", layout: "flat", root: "offer", extra: { ok: true },
      values: { ...Object.fromEntries(amounts.map((k) => [k, tf.str])), roadAssist: tf.bit, glassIncluded: tf.bit },
    },
    rules: [
      { code: "YOUNG_DRIVER_NOT_ACCEPTED", message: "youngest driver under 21", when: (s) => s.driver.youngestAge < 21 },
      { code: "PRODUCT_NOT_OFFERED", message: "standalone mandatory cover is not sold online", when: (s) => s.coverage.kind === "mandatory" },
    ],
    decline: {
      shape: (code, msg) => ({ ok: false, code, message: msg, retryable: false }),
      read: (j) => ({ code: j.code, message: j.message }),
    },
  });
})();
