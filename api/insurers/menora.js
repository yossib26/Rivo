/* מנורה מבטחים · שירות הצעות מחיר לרכב (מדומה).
   סגנון: JSON:API (data.type / data.attributes), שגיאות במערך errors. */
(function () {
  const tf = InsurerApi.tf;
  InsurerApi.register({
    id: "menora", name: "מנורה מבטחים",
    endpoint: "https://gw.menora-partners.example/v1/vehicle-quotes",
    headers: { Authorization: "Bearer demo-menora-5b8e19", "Content-Type": "application/vnd.api+json" },
    latency: [310, 640], priceBias: 1.02,
    request: {
      style: "camel", layout: "nested", root: "data.attributes", extra: { data: { type: "vehicleQuoteRequest" } },
      values: { "usage.type": tf.map({ private: "PRIVATE", business: "BUSINESS_MIXED" }) },
    },
    response: {
      style: "camel", layout: "nested", root: "data.attributes",
      extra: (t) => ({ data: { type: "vehicleQuote", id: t.quoteId }, links: { self: "https://gw.menora-partners.example/v1/vehicle-quotes/" + t.quoteId } }),
    },
    rules: [{ code: "YOUNG_DRIVER_NOT_ACCEPTED", message: "youngest driver under 19", when: (s) => s.driver.youngestAge < 19 }],
    decline: {
      shape: (code, msg) => ({ errors: [{ status: "422", code, title: msg }] }),
      read: (j) => ({ code: j.errors[0].code, message: j.errors[0].title }),
    },
  });
})();
