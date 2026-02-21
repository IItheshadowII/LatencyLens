import "dotenv/config";
import express from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pipeline } from "node:stream";
import { Readable } from "node:stream";
import { initDb } from "./db.js";
import { resultSchema } from "./schema.js";
import net from "node:net";

const PORT = Number(process.env.PORT || 3001);
const CORS_ORIGIN = process.env.CORS_ORIGIN || "*";
const TRUST_PROXY = process.env.TRUST_PROXY === "true";
const DATABASE_PATH = process.env.DATABASE_PATH || "./data/praxis.sqlite";
const RATE_LIMIT_WINDOW_MS = Number(process.env.RATE_LIMIT_WINDOW_MS || 60000);
const RATE_LIMIT_MAX = Number(process.env.RATE_LIMIT_MAX || 60);

const app = express();
app.set("trust proxy", TRUST_PROXY);

// CORS applies to all routes (including the proxy routes below)
app.use(cors({ origin: CORS_ORIGIN }));

// --- Proxy endpoints (placed before JSON body parser so uploads can be streamed) ---

app.get("/api/proxy/download", async (req: express.Request, res: express.Response) => {
  const cloudRaw = typeof req.query.cloud === "string" ? req.query.cloud : undefined;
  const cloud = cloudRaw ? normalizeCloud(cloudRaw) : null;
  const bytes = Number(req.query.bytes || 1) || 1;

  if (!cloud) return res.status(400).json({ error: "Invalid cloud URL" });

  try {
    const target = `${cloud}/connection-probe/download.ashx?bytes=${bytes}&t=${Date.now()}`;
    const upstream = await fetch(target);
    res.status(upstream.status);
    // forward a few headers
    upstream.headers.forEach((v, k) => {
      // avoid forwarding hop-by-hop headers that could confuse express
      if (!["transfer-encoding"].includes(k.toLowerCase())) res.setHeader(k, v);
    });

    if (upstream.body && (Readable as any).fromWeb) {
      const nodeStream = (Readable as any).fromWeb(upstream.body);
      pipeline(nodeStream, res, (err) => {
        if (err) console.error("Proxy download pipeline error:", err);
      });
    } else {
      // fallback
      const buf = Buffer.from(await upstream.arrayBuffer());
      res.send(buf);
    }
  } catch (error) {
    console.error("Proxy download error:", error);
    res.status(502).json({ error: "Failed to proxy download" });
  }
});

app.post("/api/proxy/upload", async (req: express.Request, res: express.Response) => {
  const cloudRaw = typeof req.query.cloud === "string" ? req.query.cloud : undefined;
  const cloud = cloudRaw ? normalizeCloud(cloudRaw) : null;
  if (!cloud) return res.status(400).json({ error: "Invalid cloud URL" });

  try {
    const target = `${cloud}/connection-probe/upload.ashx?t=${Date.now()}`;

    // Forward the incoming request stream to the upstream upload handler
    const init: any = {
      method: "POST",
      // copy some useful headers but let fetch set Host
      headers: {
        "content-type": req.headers["content-type"] as string || "application/octet-stream"
      },
      // When passing a Node stream as body to global fetch (undici) we must provide duplex
      // so the request can be streamed. Use 'half' per undici docs.
      duplex: "half",
      // req is a Node/Express readable stream (we registered this route before express.json)
      body: req as any
    };

    const upstream = await fetch(target, init);

    res.status(upstream.status);
    upstream.headers.forEach((v, k) => res.setHeader(k, v));
    if (upstream.body && (Readable as any).fromWeb) {
      const nodeStream = (Readable as any).fromWeb(upstream.body);
      pipeline(nodeStream, res, (err) => {
        if (err) console.error("Proxy upload pipeline error:", err);
      });
    } else {
      const obj = await upstream.json().catch(() => null);
      res.json(obj);
    }
  } catch (error) {
    console.error("Proxy upload error:", error);
    res.status(502).json({ error: "Failed to proxy upload" });
  }
});

// --- End proxy endpoints ---

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
  // Prefer an IPv4 address. Handle cases where Express returns an IPv6-mapped IPv4 like ::ffff:172.19.0.1
  const tryParseIPv4 = (candidate?: string | string[] | undefined): string | null => {
    if (!candidate) return null;
    if (Array.isArray(candidate)) candidate = candidate[0];
    if (typeof candidate !== "string") return null;
    // X-Forwarded-For may be a comma separated list. Try each entry.
    const parts = candidate.split(",").map((s) => s.trim());
    for (const p of parts) {
      // IPv6 mapped IPv4
      const m = p.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i);
      if (m && net.isIP(m[1]) === 4) return m[1];
      // plain IPv4
      if (net.isIP(p) === 4) return p;
      // sometimes the header contains whitespace/prefixes
      const q = p.replace(/^\[|\]$/g, "");
      if (net.isIP(q) === 4) return q;
    }
    return null;
  };

  // Check X-Forwarded-For first (may contain client IPs when behind proxies)
  const xff = tryParseIPv4(req.headers["x-forwarded-for"] as any);
  if (xff) return res.json({ ip: xff });

  // Next, try req.ip (Express may return ::ffff:IPv4)
  const fromReqIp = tryParseIPv4(req.ip);
  if (fromReqIp) return res.json({ ip: fromReqIp });

  // Fallback to socket remote address and strip IPv6-mapped prefix
  const remote = (req.socket && req.socket.remoteAddress) || (req.connection && (req.connection as any).remoteAddress) || undefined;
  const fromRemote = tryParseIPv4(remote as any);
  if (fromRemote) return res.json({ ip: fromRemote });

  // As a last resort return the raw req.ip (may be IPv6); caller can decide how to show it.
  res.json({ ip: req.ip || null });
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
