import { getStore } from "@netlify/blobs";
import crypto from "node:crypto";
import { DEFAULTS, COMPONENT_IDS, ROLES, normalize, diff, mergeByRole } from "../lib/shared.mjs";

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });

/* ---------- tokens ---------- */
const SECRET = () => process.env.SESSION_SECRET || process.env.ADMIN_PASSWORD || "";
const sign = (payload) => crypto.createHmac("sha256", SECRET()).update(payload).digest("base64url");

function makeToken(uid, name) {
  const payload = Buffer.from(JSON.stringify({ uid, name, exp: Date.now() + 8 * 3600 * 1000 })).toString("base64url");
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
    return data.exp > Date.now() && data.uid ? data : null;
  } catch {
    return null;
  }
}

/* ---------- passwords ---------- */
const adminPasswordOk = (given) => {
  const real = process.env.ADMIN_PASSWORD || "";
  const a = crypto.createHash("sha256").update(String(given)).digest();
  const b = crypto.createHash("sha256").update(real).digest();
  return real.length > 0 && crypto.timingSafeEqual(a, b);
};
const hashPw = (pw, salt) => crypto.scryptSync(String(pw), salt, 32).toString("hex");
const newPw = (pw) => {
  const salt = crypto.randomBytes(16).toString("hex");
  return { salt, hash: hashPw(pw, salt) };
};
const pwMatches = (pw, u) => {
  const a = Buffer.from(hashPw(pw, u.salt), "hex");
  const b = Buffer.from(u.hash, "hex");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};

/* ---------- storage helpers ---------- */
const getUsers = async (store) => (await store.get("users", { type: "json" })) ?? [];
const publicUser = (u) => ({ id: u.id, username: u.username, name: u.name, role: u.role, components: u.components });

async function addLog(store, user, changes) {
  const log = (await store.get("log", { type: "json" })) ?? [];
  log.unshift({ time: new Date().toISOString(), user, changes });
  await store.setJSON("log", log.slice(0, 1000));
}

const profile = (m) => ({
  name: m.name, username: m.username, role: m.role, roleLabel: ROLES[m.role], components: m.components,
});

async function resolveSession(req, store) {
  const t = readToken(req);
  if (!t) return null;
  if (t.uid === "admin") {
    return { uid: "admin", name: t.name, username: "admin", role: "admin", components: COMPONENT_IDS };
  }
  const u = (await getUsers(store)).find((x) => x.id === t.uid);
  if (!u) return null; // login was deleted
  return { uid: u.id, name: u.name, username: u.username, role: u.role, components: u.components };
}

const titleOf = (id) => DEFAULTS.components.find((c) => c.id === id)?.title ?? id;
const compText = (ids) =>
  ids.length ? ids.map((id) => `${COMPONENT_IDS.indexOf(id) + 1}. ${titleOf(id)}`).join("; ") : "none";

export default async (req) => {
  const store = getStore("hri-site");
  const path = new URL(req.url).pathname.replace(/\/$/, "");

  if (!process.env.ADMIN_PASSWORD) {
    return json({ error: "ADMIN_PASSWORD is not set in the Netlify environment variables." }, 500);
  }

  /* ----- login (admin: login ID "admin" + ADMIN_PASSWORD + typed name) ----- */
  if (path === "/api/admin/login" && req.method === "POST") {
    const { username, password, name } = await req.json().catch(() => ({}));
    const uname = String(username || "").trim().toLowerCase().slice(0, 60);
    if (!uname) return json({ error: "Please enter your login ID." }, 400);

    let me;
    if (uname === "admin") {
      const clean = String(name || "").trim().slice(0, 80);
      if (clean.length < 2) return json({ error: "Admin login: please also type your name. It is recorded in the activity log." }, 400);
      if (!adminPasswordOk(password)) {
        await new Promise((r) => setTimeout(r, 1200));
        return json({ error: "Wrong login ID or password." }, 401);
      }
      me = { uid: "admin", name: clean, username: "admin", role: "admin", components: COMPONENT_IDS };
    } else {
      const u = (await getUsers(store)).find((x) => x.username === uname);
      if (!u || !pwMatches(password, u)) {
        await new Promise((r) => setTimeout(r, 1200));
        return json({ error: "Wrong login ID or password." }, 401);
      }
      me = { uid: u.id, name: u.name, username: u.username, role: u.role, components: u.components };
    }
    await addLog(store, me.name, [`Logged in (${ROLES[me.role]})`]);
    return json({ token: makeToken(me.uid, me.name), profile: profile(me) });
  }

  const me = await resolveSession(req, store);
  if (!me) return json({ error: "Session expired. Please log in again." }, 401);

  if (path === "/api/admin/me" && req.method === "GET") return json(profile(me));

  /* ----- save content (permissions enforced here, not just in the browser) ----- */
  if (path === "/api/admin/save" && req.method === "POST") {
    const body = await req.json().catch(() => ({}));
    const oldData = normalize(await store.get("content", { type: "json" }));
    const newData = mergeByRole(oldData, body.data, me);
    const changes = diff(oldData, newData);
    if (changes.length === 0) return json({ ok: true, changes: [], data: newData });
    await store.setJSON("content", newData);
    await addLog(store, me.name, changes);
    return json({ ok: true, changes, data: newData });
  }

  /* ----- everything below is admin-only ----- */
  if (me.role !== "admin") return json({ error: "Only the admin can do this." }, 403);

  if (path === "/api/admin/log" && req.method === "GET") {
    return json((await store.get("log", { type: "json" })) ?? []);
  }

  if (path === "/api/admin/users" && req.method === "GET") {
    return json({ users: (await getUsers(store)).map(publicUser) });
  }

  if (path === "/api/admin/users" && req.method === "POST") {
    const body = await req.json().catch(() => ({}));
    const users = await getUsers(store);

    if (body.action === "delete") {
      const u = users.find((x) => x.id === body.id);
      if (!u) return json({ error: "Login not found." }, 404);
      const rest = users.filter((x) => x !== u);
      await store.setJSON("users", rest);
      await addLog(store, me.name, [`Login deleted: "${u.name}" (${u.username})`]);
      return json({ users: rest.map(publicUser) });
    }

    const inp = body.user || {};
    const name = String(inp.name || "").trim().slice(0, 80);
    const role = ["investigator", "member"].includes(inp.role) ? inp.role : null;
    const components = Array.isArray(inp.components) ? COMPONENT_IDS.filter((id) => inp.components.includes(id)) : [];
    const password = String(inp.password || "");
    const existing = inp.id ? users.find((x) => x.id === inp.id) : null;

    if (name.length < 2) return json({ error: "Enter the person's name." }, 400);
    if (!role) return json({ error: "Choose a role (Investigator or Team member)." }, 400);

    if (!existing) {
      const uname = String(inp.username || "").trim().toLowerCase();
      if (!/^[a-z0-9._-]{3,30}$/.test(uname)) return json({ error: "Login ID: 3–30 characters, letters, numbers, dot, dash or underscore." }, 400);
      if (uname === "admin" || users.some((x) => x.username === uname)) return json({ error: "That login ID is already taken." }, 400);
      if (password.length < 6) return json({ error: "Password must be at least 6 characters." }, 400);
      if (users.length >= 200) return json({ error: "Too many logins." }, 400);
      const u = { id: crypto.randomBytes(6).toString("hex"), username: uname, name, role, components, ...newPw(password) };
      users.push(u);
      await store.setJSON("users", users);
      await addLog(store, me.name, [`Login created: "${name}" (${uname}), ${ROLES[role]}, components: ${compText(components)}`]);
    } else {
      if (password && password.length < 6) return json({ error: "Password must be at least 6 characters." }, 400);
      const notes = [];
      if (existing.name !== name) notes.push(`name changed from "${existing.name}" to "${name}"`);
      if (existing.role !== role) notes.push(`role changed from ${ROLES[existing.role]} to ${ROLES[role]}`);
      if (existing.components.join() !== components.join()) notes.push(`components changed to: ${compText(components)}`);
      if (password) notes.push("password changed");
      Object.assign(existing, { name, role, components }, password ? newPw(password) : {});
      await store.setJSON("users", users);
      if (notes.length) await addLog(store, me.name, [`Login updated for ${existing.username}: ${notes.join("; ")}`]);
    }
    return json({ users: users.map(publicUser) });
  }

  return json({ error: "Not found" }, 404);
};

export const config = { path: "/api/admin/*" };
