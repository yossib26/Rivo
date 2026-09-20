/* מגדל · שירות הצעות מחיר לרכב (מדומה).
   סגנון: PascalCase מקונן, סכומים כמחרוזות עם פסיקים ("3,220.00"), דגלים Y/N. */
(function () {
  const tf = InsurerApi.tf;
  const amounts = ["premiumAnnual", "premiumMonthly", "deductible", "sumInsured", "thirdPartyLimit", "glassDeductible", "batteryLimit", "chargerLimit"];
  InsurerApi.register({
    id: "migdal", name: "מגדל",
    endpoint: "https://quotes.migdal-api.example/motor/QuoteService.svc/GetQuote",
    headers: { "Ocp-Apim-Subscription-Key": "demo-migdal-91ab0c" },
    latency: [330, 640], priceBias: 1.04,
    request: {
      style: "pascal", layout: "nested", root: "QuoteRequest",
      values: { "prior.annualPremiumNis": tf.money2, "prior.deductibleNis": tf.money2, "prior.sumInsuredNis": tf.money2, "driver.atFault": tf.yn, "driver.priorCancellation": tf.yn, "driver.convictions": tf.yn, "usage.security": tf.yn, "vehicle.year": tf.str },
    },
    response: {
      style: "pascal", layout: "nested", root: "QuoteResult", extra: { Status: "Success" },
      values: { ...Object.fromEntries(amounts.map((k) => [k, tf.money2])), roadAssist: tf.yn, glassIncluded: tf.yn, installments: tf.str, replacementDays: tf.str },
    },
    rules: [{ code: "AT_FAULT_CLAIMS", message: "two or more at-fault claims", when: (s) => s.driver.atFault && s.driver.claimsCount >= 2 }],
    decline: {
      shape: (code, msg) => ({ Status: "Declined", Errors: [{ Code: code, Description: msg }] }),
      read: (j) => ({ code: j.Errors[0].Code, message: j.Errors[0].Description }),
    },
  });
})();
