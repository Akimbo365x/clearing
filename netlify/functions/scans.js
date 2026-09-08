// Registre public des tokens analysés sur le site.
//
// Stocké dans Netlify Blobs : pas de compte externe, pas de clé, inclus dans
// le projet. Un seul document JSON contient la liste — à ce volume de trafic
// c'est largement suffisant, et ça évite de lister des milliers de clés.
//
// Rien de personnel n'est enregistré : ni IP, ni identifiant, ni donnée liée
// à un visiteur. Uniquement le token et le nombre de fois qu'il a été vu.

import { getStore } from "@netlify/blobs";

const KEY = "index";
const MAX = 120;

const json = (obj, status) =>
  new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=0, must-revalidate",
    },
  });

// N'importe qui peut appeler cette adresse : tout ce qui arrive est donc
// vérifié et tronqué avant d'être conservé.
const BASE58 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const CONTROL = new RegExp("[\\u0000-\\u001F\\u007F<>]", "g");

function clean(value, max) {
  if (typeof value !== "string") return "";
  return value.replace(CONTROL, "").trim().slice(0, max);
}

function cleanImage(value) {
  if (typeof value !== "string") return "";
  if (!/^https:\/\//i.test(value)) return "";
  return value.replace(CONTROL, "").slice(0, 400);
}

export default async (req) => {
  let store;
  try {
    store = getStore("scans");
  } catch (e) {
    return json({ error: "Storage unavailable" }, 503);
  }

  if (req.method === "GET") {
    const list = (await store.get(KEY, { type: "json" })) || [];
    return json({ scans: list });
  }

  if (req.method !== "POST") {
    return json({ error: "GET or POST only" }, 405);
  }

  let body;
  try {
    body = await req.json();
  } catch (e) {
    return json({ error: "Unreadable body" }, 400);
  }

  const mint = clean(body && body.mint, 44);
  if (!BASE58.test(mint)) {
    return json({ error: "Not a Solana address" }, 400);
  }

  const entry = {
    mint,
    sym: clean(body.sym, 16),
    name: clean(body.name, 48),
    img: cleanImage(body.img),
  };

  const list = (await store.get(KEY, { type: "json" })) || [];
  const at = list.findIndex((t) => t.mint === mint);

  if (at !== -1) {
    // déjà connu : on le remonte en tête et on incrémente son compteur
    const known = list.splice(at, 1)[0];
    entry.count = (known.count || 1) + 1;
  } else {
    entry.count = 1;
  }

  entry.last = Date.now();
  list.unshift(entry);

  await store.setJSON(KEY, list.slice(0, MAX));

  return json({ ok: true, count: entry.count });
};

export const config = { path: "/api/scans" };
