// הרצה עם מסד נתונים בזיכרון (pg-mem) במקום Neon: לפיתוח ובדיקות בלי חיבור לרשת.
// הרצה: npm run dev:memory  (הנתונים נמחקים בכל הפעלה)
process.env.SESSION_SECRET ||= "dev-memory-secret";
process.env.DEMO_MODE ||= "1";
process.env.ALLOW_MOCK_GOOGLE ||= "1";
const { newDb } = require("pg-mem");
const db = require("./db");
const { setup } = require("./setup-db");
const { createApp } = require("./index");

(async () => {
  db.setPool(new (newDb().adapters.createPg().Pool)());
  await setup(() => {});
  const port = +process.env.PORT || 8000;
  createApp().listen(port, () => console.log(`Rivo (DB בזיכרון): http://localhost:${port}`));
})();
