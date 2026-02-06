import "dotenv/config";
import express from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { initDb } from "./db.js";
import { resultSchema } from "./schema.js";

const PORT = Number(process.env.PORT || 3001);
const CORS_ORIGIN = process.env.CORS_ORIGIN || "*";
const TRUST_PROXY = process.env.TRUST_PROXY === "true";
const DATABASE_PATH = process.env.DATABASE_PATH || "./data/praxis.sqlite";
const RATE_LIMIT_WINDOW_MS = Number(process.env.RATE_LIMIT_WINDOW_MS || 60000);
const RATE_LIMIT_MAX = Number(process.env.RATE_LIMIT_MAX || 60);

const app = express();
app.set("trust proxy", TRUST_PROXY);

app.use(cors({ origin: CORS_ORIGIN }));
app.use(express.json({ limit: "1mb" }));
app.use(
  rateLimit({
    windowMs: RATE_LIMIT_WINDOW_MS,
    max: RATE_LIMIT_MAX,
    standardHeaders: true,
    legacyHeaders: false
  })
);

const db = initDb(DATABASE_PATH);

const normalizeCloud = (raw: string) => {
  try {
    const url = new URL(raw);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return null;
    }
    return url.origin;
  } catch (error) {
    return null;
  }
};

app.get("/healthz", (_req: express.Request, res: express.Response) => {
  res.json({ ok: true, timestamp: new Date().toISOString() });
});

app.get("/api/ip", (req: express.Request, res: express.Response) => {
  res.json({ ip: req.ip });
});

app.post("/api/results", (req: express.Request, res: express.Response) => {
  const parsed = resultSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid payload", details: parsed.error.flatten() });
  }

  const payload = parsed.data;
  const cloud = normalizeCloud(payload.cloud);
  if (!cloud) {
    return res.status(400).json({ error: "Invalid cloud URL" });
  }

  const now = new Date().toISOString();
  const stmt = db.prepare(`
    INSERT INTO test_results (
      cloud, timestamp, user_agent, screen, ip, ping_json, download_json, upload_json, classification, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    cloud,
    payload.timestamp,
    payload.userAgent,
    payload.screen,
    req.ip,
    JSON.stringify(payload.ping),
    JSON.stringify(payload.download),
    JSON.stringify(payload.upload),
    payload.classification,
    now
  );

  res.status(201).json({ ok: true });
});

app.get("/api/results", (req: express.Request, res: express.Response) => {
  const cloud = typeof req.query.cloud === "string" ? normalizeCloud(req.query.cloud) : null;
  const page = Math.max(1, Number(req.query.page || 1));
  const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize || 20)));
  const offset = (page - 1) * pageSize;

  let total = 0;
  let rows: any[] = [];

  if (cloud) {
    total = (db
      .prepare("SELECT COUNT(*) as count FROM test_results WHERE cloud = ?")
      .get(cloud) as { count: number }).count;
    rows = db
      .prepare(
        "SELECT * FROM test_results WHERE cloud = ? ORDER BY created_at DESC LIMIT ? OFFSET ?"
      )
      .all(cloud, pageSize, offset);
  } else {
  total = (db.prepare("SELECT COUNT(*) as count FROM test_results").get() as { count: number }).count;
    rows = db
      .prepare("SELECT * FROM test_results ORDER BY created_at DESC LIMIT ? OFFSET ?")
      .all(pageSize, offset);
  }

  const data = rows.map((row) => ({
    id: row.id,
    cloud: row.cloud,
    timestamp: row.timestamp,
    userAgent: row.user_agent,
    screen: row.screen,
    ip: row.ip,
    ping: JSON.parse(row.ping_json),
    download: JSON.parse(row.download_json),
    upload: JSON.parse(row.upload_json),
    classification: row.classification,
    createdAt: row.created_at
  }));

  res.json({ data, page, pageSize, total });
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const adminDir = path.join(__dirname, "public");

app.use("/admin", express.static(adminDir));
app.get("/admin", (_req, res) => {
  res.sendFile(path.join(adminDir, "admin.html"));
});

app.listen(PORT, () => {
  console.log(`Praxis API listening on ${PORT}`);
});
