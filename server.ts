/**
 * Chance Productivity — server.ts v2
 * ─────────────────────────────────────────────────────────────────────────────
 * Thêm vào so với bản gốc:
 *   POST /api/auth/register  — tạo tài khoản
 *   POST /api/auth/login     — đăng nhập, nhận token
 *   GET  /api/sync           — lấy dữ liệu đã lưu của user
 *   POST /api/sync           — đẩy dữ liệu mới lên server
 *
 * Dữ liệu được lưu vào file .chance-db.json trong thư mục gốc.
 * Cùng WiFi → điện thoại có thể truy cập http://<IP-laptop>:3000
 * Khác mạng → chạy `npx ngrok http 3000` rồi dùng URL ngrok
 */

import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import crypto from "crypto";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

// ─── DB đơn giản, lưu file JSON ─────────────────────────────────────────────
const DB_FILE = path.join(process.cwd(), ".chance-db.json");

interface DBUser {
  passwordHash: string;
  data: object | null;
  createdAt: string;
}
interface DB { users: Record<string, DBUser>; }

function loadDB(): DB {
  try {
    if (fs.existsSync(DB_FILE)) return JSON.parse(fs.readFileSync(DB_FILE, "utf-8"));
  } catch {}
  return { users: {} };
}
function saveDB(db: DB) {
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), "utf-8");
}

// ─── Auth helpers ────────────────────────────────────────────────────────────
const SALT = "chance-app-2026-secret";

function hashPassword(pwd: string): string {
  return crypto.createHash("sha256").update(pwd + SALT).digest("hex");
}

/** Token đơn giản: base64(email:timestamp:hash) */
function makeToken(email: string): string {
  const payload = `${email}:${Date.now()}`;
  const sig = crypto.createHmac("sha256", SALT).update(payload).digest("hex").slice(0, 16);
  return Buffer.from(`${payload}:${sig}`).toString("base64url");
}

function verifyToken(token: string): string | null {
  try {
    const decoded = Buffer.from(token, "base64url").toString("utf-8");
    const parts   = decoded.split(":");
    if (parts.length < 3) return null;
    const email    = parts[0];
    const ts       = parts[1];
    const sig      = parts[2];
    const expected = crypto.createHmac("sha256", SALT).update(`${email}:${ts}`).digest("hex").slice(0, 16);
    return sig === expected ? email : null;
  } catch { return null; }
}

function authMiddleware(req: express.Request, res: express.Response): string | null {
  const header = req.headers.authorization ?? "";
  const token  = header.replace("Bearer ", "").trim();
  if (!token) { res.status(401).json({ error: "Thiếu token. Vui lòng đăng nhập." }); return null; }
  const email = verifyToken(token);
  if (!email) { res.status(401).json({ error: "Token không hợp lệ hoặc đã hết hạn." }); return null; }
  return email;
}

// ─── Express app ─────────────────────────────────────────────────────────────
async function startServer() {
  const app  = express();
  const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000;

  app.use(express.json({ limit: "5mb" }));

  // ── Đăng ký tài khoản ──────────────────────────────────────────────────────
  app.post("/api/auth/register", (req, res) => {
    const { email, password } = req.body ?? {};
    if (!email || !password) { res.status(400).json({ error: "Thiếu email hoặc mật khẩu." }); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { res.status(400).json({ error: "Email không hợp lệ." }); return; }
    if (password.length < 6) { res.status(400).json({ error: "Mật khẩu tối thiểu 6 ký tự." }); return; }

    const db = loadDB();
    if (db.users[email]) { res.status(409).json({ error: "Email này đã có tài khoản." }); return; }

    db.users[email] = { passwordHash: hashPassword(password), data: null, createdAt: new Date().toISOString() };
    saveDB(db);

    const token = makeToken(email);
    console.log(`[Auth] Đăng ký mới: ${email}`);
    res.json({ email, token });
  });

  // ── Đăng nhập ──────────────────────────────────────────────────────────────
  app.post("/api/auth/login", (req, res) => {
    const { email, password } = req.body ?? {};
    if (!email || !password) { res.status(400).json({ error: "Thiếu email hoặc mật khẩu." }); return; }

    const db   = loadDB();
    const user = db.users[email];
    if (!user || user.passwordHash !== hashPassword(password)) {
      res.status(401).json({ error: "Email hoặc mật khẩu không đúng." });
      return;
    }

    const token = makeToken(email);
    console.log(`[Auth] Đăng nhập: ${email}`);
    res.json({ email, token });
  });

  // ── Lấy dữ liệu đồng bộ ────────────────────────────────────────────────────
  app.get("/api/sync", (req, res) => {
    const email = authMiddleware(req, res);
    if (!email) return;

    const db = loadDB();
    const userData = db.users[email]?.data ?? null;
    res.json({ data: userData, syncedAt: new Date().toISOString() });
  });

  // ── Đẩy dữ liệu lên server ─────────────────────────────────────────────────
  app.post("/api/sync", (req, res) => {
    const email = authMiddleware(req, res);
    if (!email) return;

    const db = loadDB();
    if (!db.users[email]) { res.status(404).json({ error: "Tài khoản không tồn tại." }); return; }

    db.users[email].data = req.body;
    saveDB(db);
    console.log(`[Sync] Đẩy dữ liệu: ${email} (${JSON.stringify(req.body).length} bytes)`);
    res.json({ ok: true, savedAt: new Date().toISOString() });
  });

  // ── Hello (health check) ────────────────────────────────────────────────────
  app.get("/api/hello", (_req, res) => {
    res.json({ message: "Chance Productivity Server đang chạy! 🚀", time: new Date().toISOString() });
  });

  // ── Vite dev middleware ─────────────────────────────────────────────────────
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true, host: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => res.sendFile(path.join(distPath, "index.html")));
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`\n🚀  Chance Productivity Server`);
    console.log(`   Local:   http://localhost:${PORT}`);
    console.log(`   Network: http://<IP của bạn>:${PORT}`);
    console.log(`   DB file: ${DB_FILE}`);
    console.log(`\nĐể dùng từ điện thoại: mở http://<IP-laptop>:${PORT} trong cùng WiFi.\n`);
  });
}

startServer().catch(console.error);
