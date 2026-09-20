// נקודת הכניסה של Vercel: כל הבקשות (דפים, נתונים ו-/api/*) מנותבות לאפליקציית Express (ראו vercel.json)
require("dotenv").config();
module.exports = require("../server/index").createApp();
