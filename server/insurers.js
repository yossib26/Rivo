// רשימת חברות הביטוח מהטבלה insurers ב-DB. ציבורי: משמש גם את עמוד הנחיתה.
const express = require("express");
const db = require("./db");

const router = express.Router();

router.get("/", async (req, res, next) => {
  try {
    const r = await db.query("SELECT id, name, logo_path, website, api_endpoint FROM insurers WHERE active = TRUE ORDER BY sort_order, name");
    res.setHeader("Cache-Control", "public, max-age=60");
    res.json({ insurers: r.rows.map((x) => ({ id: x.id, name: x.name, logo: x.logo_path, website: x.website, apiEndpoint: x.api_endpoint })) });
  } catch (e) { next(e); }
});

module.exports = { router };
