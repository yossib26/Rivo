// חברות הביטוח שנטענות לטבלת insurers (npm run db:setup). מכאן והלאה המקור לרשימה הוא ה-DB.
// api_endpoint: כתובת השירות המדומה של החברה (דומיין .example), כמו בקבצי mock של api/insurers.
module.exports = [
  { id: "phoenix", name: "הפניקס", logo: "logos/phoenix.png", website: "https://www.fnx.co.il", endpoint: "https://api.fnx-quotes.example/v3/motor/quote" },
  { id: "harel", name: "הראל", logo: "logos/harel.png", website: "https://www.harel-group.co.il", endpoint: "https://api.harel.example/motor/v2/quotes" },
  { id: "migdal", name: "מגדל", logo: "logos/migdal.png", website: "https://www.migdal.co.il", endpoint: "https://quotes.migdal-api.example/motor/QuoteService.svc/GetQuote" },
  { id: "clal", name: "כלל ביטוח", logo: "logos/clal.png", website: "https://www.clalbit.co.il", endpoint: "https://ws.clal-ins.example/rest/auto/PriceOffer" },
  { id: "menora", name: "מנורה מבטחים", logo: "logos/menora.png", website: "https://www.menoramivt.co.il", endpoint: "https://gw.menora-partners.example/v1/vehicle-quotes" },
  { id: "yashir", name: "ביטוח ישיר", logo: "logos/yashir.png", website: "https://www.555.co.il", endpoint: "https://api.555-direct.example/quote/car" },
  { id: "shirbit", name: "שירביט", logo: "logos/shirbit.png", website: "https://www.shirbit.co.il", endpoint: "https://online.shirbit-ins.example/api/motor/offers" },
  { id: "hachshara", name: "הכשרה", logo: "logos/hachshara.png", website: "https://www.hcsra.co.il", endpoint: "https://services.hcsra-online.example/soap-json/MotorQuote" },
  { id: "aig", name: "AIG", logo: "logos/aig.png", website: "https://www.aig.co.il", endpoint: "https://api.aig-il.example/auto/rating/v1/quote" },
  { id: "ayalon", name: "איילון", logo: "logos/ayalon.png", website: "https://www.ayalon-ins.co.il", endpoint: "https://api.ayalon-partners.example/motor/quote/calculate" },
];
