// שרת Rivo: מגיש את האתר, נתיבי הכניסה (/api/auth/*) ונעילת עמודים ונתונים לפי סשן.
require("dotenv").config();
const path = require("path");
const express = require("express");
const { router: authRouter, currentSession } = require("./auth");
const { router: insurersRouter } = require("./insurers");

const ROOT = path.join(__dirname, "..");
const PROTECTED_PAGES = new Set(["/home.html", "/index.html", "/compare.html"]);
const PROTECTED_DATA = new Set(["/data.json", "/data2.json"]);
// קבצים שלעולם לא מוגשים: קוד שרת, סכמה, תלויות, גיט וסודות
const HIDDEN = /^\/(server|db|node_modules|package(-lock)?\.json|\.)/i;

function createApp() {
  const app = express();
  app.disable("x-powered-by");
  app.use((req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Referrer-Policy", "same-origin");
    next();
  });
  app.use(express.json({ limit: "10kb" }));
  app.use("/api/auth", authRouter);
  app.use("/api/insurers", insurersRouter);

  app.use((req, res, next) => (HIDDEN.test(req.path) ? res.status(404).type("text").send("Not found") : next()));

  // עמודי האפליקציה והנתונים דורשים סשן תקף
  app.use(async (req, res, next) => {
    const protectedPage = PROTECTED_PAGES.has(req.path), protectedData = PROTECTED_DATA.has(req.path);
    if (!protectedPage && !protectedData) return next();
    try {
      if (await currentSession(req)) { res.setHeader("Cache-Control", "no-store"); return next(); }
      if (protectedData) return res.status(401).json({ error: "unauthenticated" });
      return res.redirect("/login.html?next=" + encodeURIComponent(req.originalUrl.replace(/^\//, "")));
    } catch (e) { next(e); }
  });

  app.get("/", (req, res) => res.redirect("/landing.html"));
  app.use(express.static(ROOT, { dotfiles: "deny", index: false }));

  app.use((err, req, res, next) => {
    console.error("[error]", err.message);
    res.status(500).json({ error: "server" });
  });
  return app;
}

if (require.main === module) {
  const port = +process.env.PORT || 8000;
  const db = require("./db");
  db.query("SELECT 1").then(() => {
    createApp().listen(port, () => console.log(`Rivo: http://localhost:${port}  (מחובר ל-DB)`));
  }).catch((e) => { console.error("החיבור ל-Neon נכשל:", e.message); process.exit(1); });
}

module.exports = { createApp };
