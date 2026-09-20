/* כלל ביטוח · שירות הצעות מחיר לרכב (מדומה).
   סגנון: UPPER_SNAKE שטוח, דגלים 0/1, תאריכים בפורמט dd.mm.yyyy. */
(function () {
  const tf = InsurerApi.tf;
  InsurerApi.register({
    id: "clal", name: "כלל ביטוח",
    endpoint: "https://ws.clal-ins.example/rest/auto/PriceOffer",
    headers: { "X-Clal-Token": "demo-clal-c03d77", "Accept-Language": "he-IL" },
    latency: [260, 540], priceBias: 0.98,
    request: {
      style: "upper", layout: "flat", extra: { SOURCE_SYSTEM: "PARTNER" },
      rename: { "customer.idNumber": "CUST_TZ", "vehicle.plate": "CAR_LICENSE_NO" },
      values: { startDate: tf.dmy, "driver.atFault": tf.bit, "driver.priorCancellation": tf.bit, "driver.convictions": tf.bit, "usage.security": tf.bit, "coverage.kind": tf.upper, "prior.kind": tf.upper },
    },
    response: {
      style: "upper", layout: "flat", extra: { RESULT_CODE: 0 },
      rename: { premiumAnnual: "TOTAL_PREMIUM_YEAR", premiumMonthly: "PREMIUM_MONTH" },
      values: { roadAssist: tf.bit, glassIncluded: tf.bit, validUntil: tf.dmy, kind: tf.upper },
    },
    rules: [{ code: "LOW_LICENCE_SENIORITY", message: "licence seniority under two years", when: (s) => s.driver.licenceYears < 2 }],
    decline: {
      shape: (code, msg) => ({ RESULT_CODE: 41, ERROR_CODE: code, ERROR_TEXT: msg }),
      read: (j) => ({ code: j.ERROR_CODE, message: j.ERROR_TEXT }),
    },
  });
})();
