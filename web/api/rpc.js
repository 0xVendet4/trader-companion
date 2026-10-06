// Vercel function for the web preview: forwards read-only Solana RPC calls.
//
// The public RPC (api.mainnet-beta.solana.com) refuses requests that carry a
// web page's Origin, so the page cannot ask it directly. This forwards exactly
// four read-only methods (a balance, the token accounts, a token account's
// latest signatures, one transaction), for a valid address or signature, with
// fixed options — nothing that writes, signs or sends, and no way to use it as
// a general proxy. Mirrors `rpc_params` in src-tauri/src/lib.rs.

// The site's own RPC (an https URL with its key, set in the Vercel project's
// environment, never in the code), or the public one.
const OWN = /^https:\/\/[^\s@]+$/.test(process.env.SOLANA_RPC_URL ?? "");
const RPC = OWN ? process.env.SOLANA_RPC_URL : "https://api.mainnet-beta.solana.com";
// Keyless public RPCs asked when the public one is busy, for the calls they
// serve. Mirrors SPARE_RPCS in src-tauri/src/lib.rs.
const SPARES = [
  { url: "https://solana-rpc.publicnode.com", methods: ["getBalance", "getSignaturesForAddress", "getTransaction"] },
  { url: "https://public.rpc.solanavibestation.com", methods: ["getBalance", "getTokenAccountsByOwner", "getSignaturesForAddress", "getTransaction"] },
];
const ADDRESS = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const SIGNATURE = /^[1-9A-HJ-NP-Za-km-z]{64,90}$/;
const MAX_SIGNATURES = 50;
const TOKEN_PROGRAMS = new Set([
  "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
  "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb",
]);

/** The params to forward for an allowed call, or null when the call is refused. */
function sanitize(method, params) {
  if (!Array.isArray(params) || typeof params[0] !== "string") return null;
  if (method === "getTransaction") {
    if (!SIGNATURE.test(params[0])) return null;
    // Version 1 transactions exist: asking for less gets each of them refused.
    return [params[0], { encoding: "jsonParsed", maxSupportedTransactionVersion: 1 }];
  }
  if (!ADDRESS.test(params[0])) return null;
  if (method === "getBalance") return [params[0]];
  if (method === "getSignaturesForAddress") {
    const limit = Math.min(MAX_SIGNATURES, Math.max(1, Math.floor(Number(params[1] && params[1].limit) || 20)));
    return [params[0], { limit }];
  }
  if (method === "getTokenAccountsByOwner") {
    const programId = params[1] && params[1].programId;
    if (!TOKEN_PROGRAMS.has(programId)) return null;
    return [params[0], { programId }, { encoding: "jsonParsed" }];
  }
  return null;
}

/**
 * Whether a spare's answer can stand in for the public RPC's: a spare that
 * keeps little history answers null for an older transaction and no
 * signatures for a wallet. Mirrors `serves` in src-tauri/src/lib.rs.
 */
function serves(method, result) {
  if (method === "getSignaturesForAddress") return Array.isArray(result) && result.length > 0;
  return result != null;
}

/** One call to one RPC: ok when it answered 200 with JSON. */
async function ask(url, payload) {
  try {
    const upstream = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: payload });
    const json = await upstream.json().catch(() => null);
    return { ok: upstream.ok && json != null, json };
  } catch {
    return { ok: false, json: null };
  }
}

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: { message: "POST only" } });
  }
  const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
  const params = sanitize(body.method, body.params);
  if (!params) return res.status(400).json({ error: { message: "Call not allowed" } });

  const payload = JSON.stringify({ jsonrpc: "2.0", id: 1, method: body.method, params });
  let answer = await ask(RPC, payload);
  if (!answer.ok && !OWN) {
    for (const spare of SPARES.filter((s) => s.methods.includes(body.method))) {
      const a = await ask(spare.url, payload);
      if (a.ok && !a.json.error && serves(body.method, a.json.result)) {
        answer = a;
        break;
      }
    }
  }
  res.setHeader("Cache-Control", "no-store");
  if (answer.json) return res.status(answer.ok ? 200 : 502).json(answer.json);
  return res.status(502).json({ error: { message: "Solana RPC unreachable" } });
};
