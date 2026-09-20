// משתמשי דמה (מוזנים ל-DB רק כש-DEMO_MODE=1). הסיסמאות ידועות לכולם: אין להשתמש בהם בסביבה אמיתית.
module.exports = {
  USERS: [
    { username: "agent", password: "Agent#2026", name: "דנה לוי", role: "סוכנת ביטוח", email: "dana.levi@example.co.il", phone: "0521234567" },
    { username: "alex", password: "Alex#2026", name: "אלכס כהן", role: "לקוח", email: "alex.cohen@example.co.il", phone: "0548765432", idNumber: "012345678" },
    { username: "noa", password: "Noa#2026", name: "נועה ברק", role: "לקוחה", email: "noa.barak@example.co.il", phone: "0501112233", idNumber: "123456789" },
  ],
  // חשבונות Google מדומים בחלון הבחירה
  GOOGLE: [
    { name: "אלכס כהן", email: "alex.cohen@example.co.il" },
    { name: "דנה לוי", email: "dana.levi@example.co.il" },
  ],
};
