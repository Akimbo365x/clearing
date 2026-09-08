// Relais RPC — tourne sur le serveur Netlify, pas dans le navigateur.
//
// Un navigateur refuse qu'une page appelle un serveur d'un autre domaine
// (règle de sécurité : le CORS). Un serveur n'a pas cette limite. La page
// appelle donc /api/rpc, qui est sur son propre domaine, et ce fichier va
// chercher les données sur les nœuds Solana publics.
//
// Aucune clé API nécessaire. Si tu en prends une plus tard (Helius par ex.),
// ajoute-la dans Netlify sous Site settings → Environment variables, avec le
// nom RPC_URL : elle sera utilisée en priorité et restera invisible côté page.

const PUBLIC_NODES = [
  "https://rpc.solanatracker.io/public",
  "https://solana-rpc.publicnode.com",
  "https://solana.drpc.org",
  "https://api.mainnet-beta.solana.com",
];

// Lecture seule : personne ne peut se servir du relais pour envoyer une
// transaction ou faire autre chose que consulter la blockchain.
const ALLOWED = new Set([
  "getAccountInfo",
  "getMultipleAccounts",
  "getTokenLargestAccounts",
  "getTokenSupply",
]);

const json = (obj, status) =>
  new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: { "Content-Type": "application/json" },
  });

export default async (req) => {
  if (req.method !== "POST") {
    return json({ error: { message: "POST uniquement" } }, 405);
  }

  let body;
  try {
    body = await req.json();
  } catch (e) {
    return json({ error: { message: "Corps de requête illisible" } }, 400);
  }

  if (!body || !ALLOWED.has(body.method)) {
    return json({ error: { message: "Méthode non autorisée" } }, 400);
  }

  const nodes = process.env.RPC_URL
    ? [process.env.RPC_URL, ...PUBLIC_NODES]
    : PUBLIC_NODES;

  let lastStatus = 0;
  let lastError = "";

  for (const url of nodes) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 10000);

      const upstream = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: body.method,
          params: body.params,
        }),
        signal: controller.signal,
      });

      clearTimeout(timer);
      lastStatus = upstream.status;

      if (!upstream.ok) continue; // saturé ou en panne : nœud suivant

      const data = await upstream.json();

      // Erreur métier (adresse inconnue, paramètre invalide) → c'est une vraie
      // réponse sur la question posée, on la transmet telle quelle.
      // Tout autre message d'erreur veut dire que ce nœud-là ne va pas
      // (saturé, proxy en vrac, méthode refusée) → on passe au suivant.
      if (data.error) {
        const m = data.error.message || "";
        if (!/could not find|not found|invalid param/i.test(m)) {
          lastError = m;
          continue;
        }
      }

      return json(data);
    } catch (e) {
      continue; // timeout ou nœud injoignable
    }
  }

  return json(
    {
      error: {
        message:
          "No Solana node answered" +
          (lastStatus ? " (last status: " + lastStatus + ")" : "") +
          (lastError ? " (last error: " + lastError + ")" : "") +
          ". Try again in a minute.",
      },
    },
    502
  );
};

// C'est cette ligne qui fait répondre la fonction à l'adresse /api/rpc.
export const config = { path: "/api/rpc" };
