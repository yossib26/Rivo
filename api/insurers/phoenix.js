/* הפניקס · שירות הצעות מחיר לרכב (מדומה).
   סגנון: snake_case שטוח, סכומים באגורות, דגלים Y/N, מפתח API בכותרת. */
(function () {
  const tf = InsurerApi.tf;
  const money = { "prior.annualPremiumNis": tf.agorot, "prior.deductibleNis": tf.agorot, "prior.sumInsuredNis": tf.agorot };
  InsurerApi.register({
    id: "phoenix", name: "הפניקס",
    endpoint: "https://api.fnx-quotes.example/v3/motor/quote",
    headers: { "X-Api-Key": "demo-fnx-4f1c9a", "X-Partner": "rivo-demo" },
    latency: [300, 620], priceBias: 0.97,
    request: {
      style: "snake", layout: "flat", extra: { channel: "partner_api" },
      rename: { "customer.idNumber": "insured_national_id", "prior.annualPremiumNis": "prior_premium_agorot", "prior.deductibleNis": "prior_deductible_agorot", "prior.sumInsuredNis": "prior_sum_insured_agorot" },
      values: { ...money, "driver.atFault": tf.yn, "driver.priorCancellation": tf.yn, "driver.convictions": tf.yn, "usage.security": tf.yn },
    },
    response: {
      style: "snake", layout: "flat", extra: { status: "OK", currency: "ILS" },
      rename: { premiumAnnual: "premium_annual_agorot", premiumMonthly: "premium_monthly_agorot", deductible: "deductible_agorot", sumInsured: "sum_insured_agorot", thirdPartyLimit: "third_party_limit_agorot", glassDeductible: "glass_deductible_agorot", batteryLimit: "battery_limit_agorot", chargerLimit: "charger_limit_agorot" },
      values: { premiumAnnual: tf.agorot, premiumMonthly: tf.agorot, deductible: tf.agorot, sumInsured: tf.agorot, thirdPartyLimit: tf.agorot, glassDeductible: tf.agorot, batteryLimit: tf.agorot, chargerLimit: tf.agorot, roadAssist: tf.yn, glassIncluded: tf.yn },
    },
    rules: [
      { code: "TRAFFIC_CONVICTIONS", message: "serious traffic offences in the last 3 years", when: (s) => s.driver.convictions },
      { code: "AT_FAULT_CLAIMS", message: "3 or more at-fault claims", when: (s) => s.driver.atFault && s.driver.claimsCount >= 3 },
    ],
    decline: {
      shape: (code, msg) => ({ status: "REJECTED", reject_code: code, reject_reason: msg }),
      read: (j) => ({ code: j.reject_code, message: j.reject_reason }),
    },
  });
})();
