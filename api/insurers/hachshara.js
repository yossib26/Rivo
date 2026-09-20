/* הכשרה · שירות הצעות מחיר לרכב (מדומה).
   סגנון: PascalCase שטוח בתוך מעטפת Header / Body עם מזהה הודעה וגרסה. */
(function () {
  const tf = InsurerApi.tf;
  const header = (std) => ({ MessageId: std.requestId, Timestamp: new Date().toISOString(), Version: "1.4" });
  InsurerApi.register({
    id: "hachshara", name: "הכשרה",
    endpoint: "https://services.hcsra-online.example/soap-json/MotorQuote",
    headers: { "X-Hachshara-Auth": "demo-hcsra-a91c33", SOAPAction: "GetMotorQuote" },
    latency: [340, 680], priceBias: 1.0,
    request: {
      style: "pascal", layout: "flat",
      wrap: (body, std) => ({ Header: header(std), Body: body }), unwrap: (j) => j.Body,
      values: { "driver.atFault": tf.yn, "driver.priorCancellation": tf.yn, "driver.convictions": tf.yn, "usage.security": tf.yn },
    },
    response: {
      style: "pascal", layout: "flat",
      wrap: (body, std) => ({ Header: { ...header(std), ResultCode: "0" }, Body: body }), unwrap: (j) => j.Body,
      values: { roadAssist: tf.yn, glassIncluded: tf.yn },
    },
    rules: [{ code: "PRIOR_CANCELLATION", message: "previous refusal or cancellation on record", when: (s) => s.driver.priorCancellation }],
    decline: {
      shape: (code, msg) => ({ Header: { ResultCode: "422", Version: "1.4" }, Errors: [{ Code: code, Text: msg }] }),
      read: (j) => ({ code: j.Errors[0].Code, message: j.Errors[0].Text }),
    },
  });
})();
