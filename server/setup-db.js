// יוצר את הטבלאות ב-Neon (בטוח להרצה חוזרת) ובמצב הדגמה מוסיף את משתמשי הדמה.
// הרצה: npm run db:setup
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const db = require("./db");
const sec = require("./security");
const demo = require("./demo-users");
const insurers = require("./insurers-seed");

// חברות הביטוח: מוסיפים חדשות ומעדכנים פרטים של קיימות (הפעילות והסדר שנקבעו ב-DB נשמרים)
async function seedInsurers(log = console.log) {
  for (const [i, x] of insurers.entries()) {
    const exists = (await db.query("SELECT 1 FROM insurers WHERE id = $1", [x.id])).rows.length;
    if (exists) await db.query("UPDATE insurers SET name = $2, logo_path = $3, website = $4, api_endpoint = $5 WHERE id = $1", [x.id, x.name, x.logo, x.website, x.endpoint]);
    else await db.query("INSERT INTO insurers (id, name, logo_path, website, api_endpoint, sort_order) VALUES ($1, $2, $3, $4, $5, $6)", [x.id, x.name, x.logo, x.website, x.endpoint, i + 1]);
  }
  log(`חברות ביטוח בטבלה: ${insurers.length}`);
}

async function setup(log = console.log) {
  const sql = fs.readFileSync(path.join(__dirname, "..", "db", "schema.sql"), "utf8");
  const statements = sql.replace(/--[^\n]*/g, "").split(";").map((s) => s.trim()).filter(Boolean);
  for (const s of statements) await db.query(s);
  log(`נוצרו/אומתו ${statements.length} פקודות סכמה`);

  await seedInsurers(log);

  if (process.env.DEMO_MODE === "1") {
    for (const u of demo.USERS) {
      const exists = (await db.query("SELECT 1 FROM users WHERE username = $1", [u.username])).rows.length;
      if (exists) { log(`משתמש דמה קיים: ${u.username}`); continue; }
      await db.query(
        "INSERT INTO users (id, username, password_hash, name, role, email, phone, id_number, provider) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'password')",
        [crypto.randomUUID(), u.username, await sec.hashPassword(u.password), u.name, u.role, u.email, u.phone, u.idNumber || null]);
      log(`נוסף משתמש דמה: ${u.username}`);
    }
  } else log("DEMO_MODE כבוי: משתמשי דמה לא נוספו");
}

if (require.main === module) {
  require("dotenv").config();
  setup().then(() => db.close()).catch((e) => { console.error("ההגדרה נכשלה:", e.message); process.exit(1); });
}

module.exports = { setup, seedInsurers };
