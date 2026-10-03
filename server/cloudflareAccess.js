import { createPublicKey, verify as verifySignature } from "node:crypto";

const keySets = new Map();

export function getCloudflareAccessIssuer(teamDomain) {
  const value = teamDomain.trim();
  const url = new URL(value.includes("://") ? value : `https://${value}`);
  if (url.protocol !== "https:" || url.pathname !== "/" || url.search || url.hash) {
    throw new Error("CLOUDFLARE_ACCESS_TEAM_DOMAIN must be an HTTPS team domain.");
  }
  return url.origin;
}

async function getKeys(issuer, forceRefresh = false) {
  const cached = keySets.get(issuer);
  if (!forceRefresh && cached?.expiresAt > Date.now()) return cached.keys;
  if (!forceRefresh && cached?.request) return cached.request;

  const request = (async () => {
    const response = await fetch(`${issuer}/cdn-cgi/access/certs`, {
      signal: AbortSignal.timeout(5000)
    });
    if (!response.ok) throw new Error(`Cloudflare Access JWKS request failed with status ${response.status}.`);
    const body = await response.json();
    if (!Array.isArray(body.keys)) throw new Error("Cloudflare Access returned an invalid JWKS response.");
    keySets.set(issuer, { keys: body.keys, expiresAt: Date.now() + 5 * 60 * 1000 });
    return body.keys;
  })();

  keySets.set(issuer, { ...cached, request });
  try {
    return await request;
  } catch (error) {
    keySets.delete(issuer);
    throw error;
  }
}

export async function verifyCloudflareAccessJwt(token, { issuer, audience }) {
  const parts = token.split(".");
  if (parts.length !== 3 || !issuer || !audience) return false;

  let header;
  let claims;
  try {
    header = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8"));
    claims = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
  } catch {
    return false;
  }

  const now = Math.floor(Date.now() / 1000);
  const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (
    header.alg !== "RS256"
    || typeof header.kid !== "string"
    || claims.iss !== issuer
    || !audiences.includes(audience)
    || typeof claims.exp !== "number"
    || claims.exp <= now
    || (typeof claims.nbf === "number" && claims.nbf > now + 60)
  ) {
    return false;
  }

  let keys = await getKeys(issuer);
  let signingKey = keys.find((key) => key.kid === header.kid);
  if (!signingKey) {
    keys = await getKeys(issuer, true);
    signingKey = keys.find((key) => key.kid === header.kid);
  }
  if (!signingKey) return false;

  const publicKey = createPublicKey({ key: signingKey, format: "jwk" });
  return verifySignature(
    "RSA-SHA256",
    Buffer.from(`${parts[0]}.${parts[1]}`),
    publicKey,
    Buffer.from(parts[2], "base64url")
  );
}
