import { getStore } from "@netlify/blobs";
import crypto from "node:crypto";
import { DEFAULTS, sanitize, diff } from "../lib/shared.mjs";

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });

const SECRET = () => process.env.SESSION_SECRET || process.env.ADMIN_PASSWORD || "";
const sign = (payload) => crypto.createHmac("sha256", SECRET()).update(payload).digest("base64url");

function makeToken(name) {
  const payload = Buffer.from(JSON.stringify({ name, exp: Date.now() + 8 * 3600 * 1000 })).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

function readToken(req) {
  const auth = req.headers.get("authorization") || "";
  const [payload, sig] = auth.replace(/^Bearer /, "").split(".");
  if (!payload || !sig || !SECRET()) return null;
  const expected = sign(payload);
  if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString());
    return data.exp > Date.now() && data.name ? data : null;
  } catch {
    return null;
  }
}

const passwordOk = (given) => {
  const real = process.env.ADMIN_PASSWORD || "";
  const a = crypto.createHash("sha256").update(String(given)).digest();
  const b = crypto.createHash("sha256").update(real).digest();
  return real.length > 0 && crypto.timingSafeEqual(a, b);
};

export default async (req) => {
  const store = getStore("hri-site");
  const path = new URL(req.url).pathname.replace(/\/$/, "");

  if (!process.env.ADMIN_PASSWORD) {
    return json({ error: "ADMIN_PASSWORD is not set in the Netlify environment variables." }, 500);
  }

  if (path === "/api/admin/login" && req.method === "POST") {
    const { name, password } = await req.json().catch(() => ({}));
    const clean = String(name || "").trim().slice(0, 80);
    if (clean.length < 2) return json({ error: "Please enter your name." }, 400);
    if (!passwordOk(password)) {
      await new Promise((r) => setTimeout(r, 1200));
      return json({ error: "Wrong password." }, 401);
    }
    const log = (await store.get("log", { type: "json" })) ?? [];
    log.unshift({ time: new Date().toISOString(), user: clean, changes: ["Logged in"] });
    await store.setJSON("log", log.slice(0, 1000));
    return json({ token: makeToken(clean), name: clean });
  }

  const session = readToken(req);
  if (!session) return json({ error: "Session expired. Please log in again." }, 401);

  if (path === "/api/admin/save" && req.method === "POST") {
    const body = await req.json().catch(() => ({}));
    const oldData = (await store.get("content", { type: "json" })) ?? DEFAULTS;
    const newData = sanitize(body.data);
    const changes = diff(oldData, newData);
    if (changes.length === 0) return json({ ok: true, changes: [], data: newData });
    await store.setJSON("content", newData);
    const log = (await store.get("log", { type: "json" })) ?? [];
    log.unshift({ time: new Date().toISOString(), user: session.name, changes });
    await store.setJSON("log", log.slice(0, 1000));
    return json({ ok: true, changes, data: newData });
  }

  if (path === "/api/admin/log" && req.method === "GET") {
    return json((await store.get("log", { type: "json" })) ?? []);
  }

  return json({ error: "Not found" }, 404);
};

export const config = { path: "/api/admin/*" };
