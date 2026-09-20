/* ביטוח ישיר · שירות הצעות מחיר לרכב (מדומה).
   סגנון: snake_case מקונן, דגל success בראש התגובה, עטיפת result. */
(function () {
  const tf = InsurerApi.tf;
  InsurerApi.register({
    id: "yashir", name: "ביטוח ישיר",
    endpoint: "https://api.555-direct.example/quote/car",
    headers: { "X-Auth-Token": "demo-yashir-e6a2d4" },
    latency: [270, 520], priceBias: 0.9,
    request: {
      style: "snake", layout: "nested",
      rename: { "customer.idNumber": "person.id_number", "customer.firstName": "person.first_name", "customer.lastName": "person.last_name", "customer.phone": "person.mobile", "customer.age": "person.age" },
      values: { "usage.type": tf.map({ private: "personal", business: "commercial" }) },
    },
    response: {
      style: "snake", layout: "nested", root: "result", extra: { success: true },
      rename: { premiumAnnual: "price.yearly", premiumMonthly: "price.monthly", installments: "price.max_payments", deductible: "covers.own_damage.deductible", sumInsured: "covers.own_damage.sum", thirdPartyLimit: "covers.third_party.limit", roadAssist: "covers.road_service", replacementDays: "covers.replacement_car_days", glassIncluded: "covers.glass.on", glassDeductible: "covers.glass.deductible", batteryLimit: "covers.ev_battery", chargerLimit: "covers.ev_charger" },
    },
    rules: [{ code: "BUSINESS_USE", message: "commercial use is not underwritten online", when: (s) => s.usage.type === "business" }],
    decline: {
      shape: (code, msg) => ({ success: false, error_code: code, error_message: msg }),
      read: (j) => ({ code: j.error_code, message: j.error_message }),
    },
  });
})();
