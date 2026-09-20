-- סכמת Rivo ב-Neon Postgres: משתמשים, אתגרי OTP וסשנים.
-- הרצה: npm run db:setup (בטוח להרצה חוזרת)

CREATE TABLE IF NOT EXISTS users (
  id              TEXT PRIMARY KEY,
  username        TEXT NOT NULL UNIQUE,
  password_hash   TEXT,                                   -- scrypt; ריק למשתמשי Google בלבד
  name            TEXT NOT NULL,
  role            TEXT NOT NULL DEFAULT 'משתמש',
  email           TEXT UNIQUE,
  phone           TEXT,
  id_number       TEXT,
  provider        TEXT NOT NULL DEFAULT 'password',
  verified        BOOLEAN NOT NULL DEFAULT TRUE,          -- הרשמה חדשה נשארת FALSE עד אימות הטלפון ב-OTP
  failed_attempts INTEGER NOT NULL DEFAULT 0,             -- ניסיונות סיסמה שגויים ברצף
  locked_until    TIMESTAMPTZ,                            -- נעילה זמנית אחרי ניסיונות שגויים
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- קוד חד-פעמי אחרי סיסמה נכונה: נשמר רק ה-HMAC של הקוד, לא הקוד עצמו
CREATE TABLE IF NOT EXISTS login_challenges (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code_hash  TEXT NOT NULL,
  attempts   INTEGER NOT NULL DEFAULT 0,
  consumed   BOOLEAN NOT NULL DEFAULT FALSE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS login_challenges_user_idx ON login_challenges (user_id);

-- סשן: נשמר רק ה-SHA-256 של הטוקן שבעוגייה. תוקף מוחלט של 30 דקות
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions (user_id);
CREATE INDEX IF NOT EXISTS sessions_expires_idx ON sessions (expires_at);

-- טבלה שנוצרה לפני הוספת העמודה: מוסיפים אותה (בטוח להרצה חוזרת)
ALTER TABLE users ADD COLUMN IF NOT EXISTS verified BOOLEAN NOT NULL DEFAULT TRUE;

-- חברות הביטוח שהמערכת משווה: המקור לרשימה בעמוד הנחיתה, בהשוואה ובמסך הטעינה
CREATE TABLE IF NOT EXISTS insurers (
  id           TEXT PRIMARY KEY,                      -- מזהה קצר: phoenix, harel...
  name         TEXT NOT NULL UNIQUE,                  -- שם להצגה
  logo_path    TEXT,                                  -- נתיב הלוגו באתר
  website      TEXT,
  api_endpoint TEXT,                                  -- כתובת שירות הצעות המחיר (מדומה)
  sort_order   INTEGER NOT NULL DEFAULT 0,
  active       BOOLEAN NOT NULL DEFAULT TRUE,         -- חברה לא פעילה לא מוצגת ולא נשאלת
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
