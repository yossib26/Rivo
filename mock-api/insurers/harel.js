/* הראל · שירות הצעות מחיר לרכב (מדומה).
   סגנון: camelCase מקונן, עטיפת quoteRequest / quote, טוקן Bearer בכותרת. */
(function () {
  const tf = InsurerApi.tf;
  InsurerApi.register({
    id: "harel", name: "הראל",
    endpoint: "https://api.harel.example/motor/v2/quotes",
    headers: { Authorization: "Bearer demo-harel-7d2e51", "X-Api-Version": "2" },
    latency: [280, 560], priceBias: 0.93,
    request: {
      style: "camel", layout: "nested", root: "quoteRequest",
      rename: { "customer.idNumber": "insured.nationalId", "customer.firstName": "insured.givenName", "customer.lastName": "insured.familyName", "driver.whoDrives": "drivers.scope", "driver.count": "drivers.count" },
      values: { "driver.whoDrives": tf.map({ any: "ANY_DRIVER", named: "NAMED_DRIVERS" }), "usage.type": tf.map({ private: "PRIVATE", business: "PRIVATE_AND_WORK" }) },
    },
    response: {
      style: "camel", layout: "nested", root: "quote", extra: { meta: { apiVersion: "2.1", currency: "ILS" } },
      rename: { premiumAnnual: "premium.annual", premiumMonthly: "premium.monthly", installments: "premium.maxInstallments", deductible: "coverage.ownDamage.deductible", sumInsured: "coverage.ownDamage.sumInsured", thirdPartyLimit: "coverage.thirdParty.propertyLimit", roadAssist: "services.roadAssistance", replacementDays: "services.replacementCarDays", glassIncluded: "services.glass.included", glassDeductible: "services.glass.deductible", batteryLimit: "ev.battery.limit", chargerLimit: "ev.charger.limit" },
    },
    rules: [{ code: "PRIOR_CANCELLATION", message: "policy previously cancelled or refused by an insurer", when: (s) => s.driver.priorCancellation }],
    decline: {
      shape: (code, msg) => ({ error: { code, message: msg, retryable: false } }),
      read: (j) => ({ code: j.error.code, message: j.error.message }),
    },
  });
})();
