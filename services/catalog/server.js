const http = require("node:http");
const fs = require("node:fs/promises");
const path = require("node:path");
const { randomUUID, timingSafeEqual } = require("node:crypto");
const { createClient } = require("redis");
const instance = process.env.HOSTNAME || "local";
const store = process.env.SESSION_STORE || "redis";
const memory = new Map();
const redis = createClient({
  url: process.env.REDIS_URL || "redis://localhost:6379",
  socket: {
    reconnectStrategy: (retries) => Math.min(retries * 100, 2000),
    connectTimeout: 1000,
  },
  disableOfflineQueue: true,
});
redis.on("error", () => {});
if (store === "redis") redis.connect().catch(() => {});
const dataFile =
  process.env.CATALOG_FILE || path.join(__dirname, "data/solutions.json");
let solutions;
let writeQueue = Promise.resolve();
function send(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ ...body, served_by: instance }));
}
async function body(req) {
  let data = "";
  for await (const chunk of req) {
    data += chunk;
    if (data.length > 65536) {
      const e = new Error("Request too large");
      e.status = 413;
      throw e;
    }
  }
  try {
    return JSON.parse(data);
  } catch {
    const e = new Error("Invalid JSON");
    e.status = 400;
    throw e;
  }
}
function valid(value) {
  return (
    value &&
    /^[a-z0-9-]{1,80}$/.test(value.id) &&
    [
      "name",
      "description",
      "owner",
      "gitlabProjectId",
      "namespace",
      "deployment",
    ].every((k) => typeof value[k] === "string" && value[k].length > 0) &&
    ["systemUrl", "documentationUrl"].every((k) => {
      try {
        return ["http:", "https:"].includes(new URL(value[k]).protocol);
      } catch {
        return false;
      }
    }) &&
    Array.isArray(value.dependencies) &&
    value.dependencies.every((x) => typeof x === "string")
  );
}
function admin(req) {
  const key = process.env.ADMIN_API_KEY;
  const given = req.headers["x-admin-key"] || "";
  return (
    key &&
    Buffer.byteLength(key) === Buffer.byteLength(given) &&
    timingSafeEqual(Buffer.from(key), Buffer.from(given))
  );
}
async function persist(next) {
  await fs.writeFile(dataFile + ".tmp", JSON.stringify(next, null, 2));
  await fs.rename(dataFile + ".tmp", dataFile);
  solutions = next;
}
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://localhost");
    const p = url.pathname;
    if (req.method === "GET" && p === "/") {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      return res.end(
        await fs.readFile(path.join(__dirname, "public/index.html")),
      );
    }
    if (req.method === "GET" && p === "/health")
      return send(res, 200, { status: "ok" });
    if (req.method === "GET" && p === "/ready") {
      try {
        if (store === "redis") await redis.ping();
        return send(res, 200, { status: "ready", store });
      } catch {
        return send(res, 503, { status: "not_ready", store });
      }
    }
    if (req.method === "GET" && p === "/v1/solutions") {
      const q = (url.searchParams.get("q") || "").toLowerCase();
      return send(res, 200, {
        solutions: solutions.filter((s) =>
          `${s.name} ${s.description} ${s.owner}`.toLowerCase().includes(q),
        ),
      });
    }
    if (req.method === "POST" && p === "/v1/solutions") {
      if (!admin(req))
        return send(res, 403, {
          error:
            "Admin API key required; writes disabled when ADMIN_API_KEY is empty",
        });
      const value = await body(req);
      if (!valid(value))
        return send(res, 400, {
          error: "Invalid solution; see OpenAPI schema",
        });
      const operation = writeQueue.then(async () => {
        if (solutions.some((s) => s.id === value.id))
          return send(res, 409, { error: "Solution already exists" });
        await persist([...solutions, value]);
        send(res, 201, { solution: value });
      });
      writeQueue = operation.catch(() => {});
      await operation;
      return;
    }
    if (req.method === "POST" && p === "/v1/sessions") {
      const id = randomUUID();
      const value = { recentSolutions: [] };
      if (store === "redis")
        await redis.set(`session:${id}`, JSON.stringify(value), { EX: 3600 });
      else memory.set(id, { value, expires: Date.now() + 3600000 });
      return send(res, 201, { sessionId: id, expiresIn: 3600 });
    }
    const sm = p.match(/^\/v1\/sessions\/([a-f0-9-]{36})$/);
    if (req.method === "GET" && sm) {
      const entry = memory.get(sm[1]);
      const raw =
        store === "redis"
          ? await redis.get(`session:${sm[1]}`)
          : entry && entry.expires > Date.now()
            ? JSON.stringify(entry.value)
            : null;
      return raw
        ? send(res, 200, { session: JSON.parse(raw) })
        : send(res, 404, { error: "Session not found" });
    }
    const m = p.match(/^\/v1\/solutions\/([a-z0-9-]+)(\/integrations)?$/);
    if (req.method === "GET" && m) {
      const solution = solutions.find((s) => s.id === m[1]);
      if (!solution) return send(res, 404, { error: "Solution not found" });
      if (!m[2]) return send(res, 200, { solution });
      const endpoint = new URL(
        "/v1/status",
        process.env.INTEGRATIONS_URL || "http://localhost:8081",
      );
      for (const key of ["gitlabProjectId", "namespace", "deployment"])
        endpoint.searchParams.set(key, solution[key]);
      try {
        const response = await fetch(endpoint, {
          signal: AbortSignal.timeout(7000),
        });
        if (!response.ok) throw new Error();
        return send(res, 200, { integrations: await response.json() });
      } catch {
        return send(res, 503, {
          error: "Integration service unavailable; catalog remains available",
        });
      }
    }
    send(res, 404, { error: "Not found" });
  } catch (e) {
    console.error(
      JSON.stringify({ event: "request_failed", message: e.message }),
    );
    send(res, e.status || 503, {
      error: e.status ? e.message : "Service temporarily unavailable",
    });
  }
});
async function start() {
  await fs.mkdir(path.dirname(dataFile), { recursive: true });
  try {
    solutions = JSON.parse(await fs.readFile(dataFile, "utf8"));
  } catch (e) {
    if (e.code !== "ENOENT") throw e;
    solutions = JSON.parse(
      await fs.readFile(path.join(__dirname, "seed.json"), "utf8"),
    );
    await persist(solutions);
  }
  server.listen(process.env.PORT || 8080, () =>
    console.log(JSON.stringify({ service: "catalog", store, instance })),
  );
}
start().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
