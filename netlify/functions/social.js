// Comptes et fil de discussion.
//
// Pas d'e-mail, pas de Google : on choisit un pseudo et un mot de passe.
// Conséquence assumée et affichée à l'inscription : un mot de passe perdu
// est un compte perdu, il n'existe aucun moyen de le récupérer.
//
// Les mots de passe ne sont jamais stockés. On garde un sel aléatoire par
// compte et l'empreinte scrypt du mot de passe. La session est un jeton
// signé en HMAC — le serveur n'a rien à mémoriser pour la vérifier.
//
// Variables d'environnement Netlify :
//   SOCIAL_SECRET  (obligatoire) une longue chaîne aléatoire, secrète
//   DEV_USERNAME   (optionnel)   le pseudo qui porte le badge DEV

import { getStore } from "@netlify/blobs";
import crypto from "node:crypto";

const FEED_KEY = "feed";
const MAX_POSTS = 200;
const POST_MAX = 280;
const POST_COOLDOWN = 20000; // 20 s entre deux messages
const SESSION_DAYS = 60;

const json = (obj, status) =>
  new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });

const CONTROL = new RegExp("[\\u0000-\\u001F\\u007F]", "g");
const NAME_OK = /^[a-zA-Z0-9_]{3,20}$/;

const secret = () => process.env.SOCIAL_SECRET || "";
const devName = () => (process.env.DEV_USERNAME || "").toLowerCase();

function hash(password, salt) {
  return crypto.scryptSync(password, salt, 64).toString("hex");
}

function sameHash(a, b) {
  const ba = Buffer.from(a, "hex");
  const bb = Buffer.from(b, "hex");
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

function sign(payload) {
  return crypto.createHmac("sha256", secret()).update(payload).digest("base64url");
}

function makeToken(name) {
  const exp = Date.now() + SESSION_DAYS * 86400000;
  const payload = `${name}.${exp}`;
  return `${payload}.${sign(payload)}`;
}

function readToken(token) {
  if (typeof token !== "string") return null;
  const bits = token.split(".");
  if (bits.length !== 3) return null;
  const payload = `${bits[0]}.${bits[1]}`;
  const expected = sign(payload);
  if (expected.length !== bits[2].length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(bits[2]))) return null;
  if (Number(bits[1]) < Date.now()) return null;
  return bits[0];
}

function publicUser(u) {
  return {
    name: u.name,
    created: u.created,
    x: u.x || "",
    dev: u.key === devName(),
  };
}

export default async (req) => {
  if (!secret()) {
    return json(
      { error: "Server not configured: SOCIAL_SECRET is missing in the Netlify environment variables." },
      503
    );
  }

  let users, feed;
  try {
    users = getStore("users");
    feed = getStore("social");
  } catch (e) {
    return json({ error: "Storage unavailable" }, 503);
  }

  const posts = async () => (await feed.get(FEED_KEY, { type: "json" })) || [];

  // ---- lecture du fil ----
  if (req.method === "GET") {
    return json({ posts: await posts() });
  }

  if (req.method !== "POST") return json({ error: "GET or POST only" }, 405);

  let body;
  try {
    body = await req.json();
  } catch (e) {
    return json({ error: "Unreadable body" }, 400);
  }

  const action = String((body && body.action) || "");
  const token = String((body && body.token) || "");

  const current = async () => {
    const key = readToken(token);
    if (!key) return null;
    return (await users.get(key, { type: "json" })) || null;
  };

  // ---- création de compte ----
  if (action === "register") {
    const name = String(body.name || "").replace(CONTROL, "").trim();
    const pass = String(body.password || "");

    if (!NAME_OK.test(name)) {
      return json({ error: "Username: 3 to 20 characters, letters, digits and underscore only." }, 400);
    }
    if (pass.length < 8) {
      return json({ error: "Password: 8 characters minimum." }, 400);
    }

    const key = name.toLowerCase();
    if (await users.get(key, { type: "json" })) {
      return json({ error: "That username is taken." }, 409);
    }

    const salt = crypto.randomBytes(16).toString("hex");
    const user = {
      key,
      name,
      salt,
      hash: hash(pass, salt),
      created: Date.now(),
      x: "",
      lastPost: 0,
    };
    await users.setJSON(key, user);

    return json({ token: makeToken(key), user: publicUser(user) });
  }

  // ---- connexion ----
  if (action === "login") {
    const key = String(body.name || "").replace(CONTROL, "").trim().toLowerCase();
    const pass = String(body.password || "");
    const user = await users.get(key, { type: "json" });

    // même réponse dans les deux cas : on ne révèle pas quels pseudos existent
    if (!user || !sameHash(user.hash, hash(pass, user.salt))) {
      return json({ error: "Wrong username or password." }, 401);
    }
    return json({ token: makeToken(key), user: publicUser(user) });
  }

  // ---- session courante ----
  if (action === "me") {
    const user = await current();
    if (!user) return json({ error: "Not signed in" }, 401);
    return json({ user: publicUser(user) });
  }

  // ---- lien X du profil ----
  if (action === "setx") {
    const user = await current();
    if (!user) return json({ error: "Not signed in" }, 401);
    const handle = String(body.x || "").replace(CONTROL, "").replace(/^@+/, "").trim().slice(0, 20);
    if (handle && !/^[A-Za-z0-9_]{1,20}$/.test(handle)) {
      return json({ error: "That does not look like an X handle." }, 400);
    }
    user.x = handle;
    await users.setJSON(user.key, user);
    return json({ user: publicUser(user) });
  }

  // ---- publication ----
  if (action === "post") {
    const user = await current();
    if (!user) return json({ error: "Not signed in" }, 401);

    const text = String(body.text || "").replace(CONTROL, "").trim().slice(0, POST_MAX);
    if (!text) return json({ error: "Empty message." }, 400);

    const since = Date.now() - (user.lastPost || 0);
    if (since < POST_COOLDOWN) {
      return json({ error: `Wait ${Math.ceil((POST_COOLDOWN - since) / 1000)}s before posting again.` }, 429);
    }

    const list = await posts();
    list.unshift({
      id: crypto.randomUUID(),
      name: user.name,
      dev: user.key === devName(),
      text,
      at: Date.now(),
      likes: [],
      reposts: [],
    });
    await feed.setJSON(FEED_KEY, list.slice(0, MAX_POSTS));

    user.lastPost = Date.now();
    await users.setJSON(user.key, user);

    return json({ ok: true, posts: list.slice(0, MAX_POSTS) });
  }

  // ---- like et repost : un interrupteur, un compte par personne ----
  if (action === "like" || action === "repost") {
    const user = await current();
    if (!user) return json({ error: "Not signed in" }, 401);

    const field = action === "like" ? "likes" : "reposts";
    const id = String(body.id || "");
    const list = await posts();
    const post = list.find((p) => p.id === id);
    if (!post) return json({ error: "Message not found" }, 404);

    if (!Array.isArray(post[field])) post[field] = [];
    const at = post[field].indexOf(user.name);
    if (at === -1) post[field].push(user.name);
    else post[field].splice(at, 1);

    await feed.setJSON(FEED_KEY, list);
    return json({ ok: true, posts: list });
  }

  // ---- suppression : son propre message, ou n'importe lequel pour le dev ----
  if (action === "delete") {
    const user = await current();
    if (!user) return json({ error: "Not signed in" }, 401);

    const id = String(body.id || "");
    const list = await posts();
    const at = list.findIndex((p) => p.id === id);
    if (at === -1) return json({ error: "Message not found" }, 404);

    const isDev = user.key === devName();
    if (!isDev && list[at].name !== user.name) {
      return json({ error: "Not your message." }, 403);
    }

    list.splice(at, 1);
    await feed.setJSON(FEED_KEY, list);
    return json({ ok: true, posts: list });
  }

  return json({ error: "Unknown action" }, 400);
};

export const config = { path: "/api/social" };
