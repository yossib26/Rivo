/* AIG ישראל · שירות הצעות מחיר לרכב (מדומה).
   סגנון: UPPER_SNAKE מקונן, ערכי enum באותיות גדולות, דגלים Y/N. */
(function () {
  const tf = InsurerApi.tf;
  InsurerApi.register({
    id: "aig", name: "AIG",
    endpoint: "https://api.aig-il.example/auto/rating/v1/quote",
    headers: { "X-AIG-Client-Id": "demo-aig-il-2210", Authorization: "Bearer demo-aig-6c0f8e" },
    latency: [320, 650], priceBias: 1.06,
    request: {
      style: "upper", layout: "nested", root: "REQUEST",
      values: { "coverage.kind": tf.upper, "driver.whoDrives": tf.upper, "usage.type": tf.upper, "usage.parking": tf.upper, "coverage.deductiblePref": tf.upper, "prior.kind": tf.upper, "driver.atFault": tf.yn, "driver.priorCancellation": tf.yn, "driver.convictions": tf.yn, "usage.security": tf.yn },
    },
    response: {
      style: "upper", layout: "nested", root: "QUOTE", extra: { CURRENCY: "ILS" },
      values: { kind: tf.upper, youngDriver: tf.upper, roadAssist: tf.yn, glassIncluded: tf.yn },
    },
    rules: [{ code: "PRODUCT_NOT_OFFERED", message: "only comprehensive motor cover is offered", when: (s) => s.coverage.kind !== "comprehensive" }],
    decline: {
      shape: (code, msg) => ({ FAULT: { CODE: code, DETAIL: msg } }),
      read: (j) => ({ code: j.FAULT.CODE, message: j.FAULT.DETAIL }),
    },
  });
})();
