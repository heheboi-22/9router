import crypto from "node:crypto";
import os from "node:os";

/**
 * Decrypt an "enc:v1:<iv>.<tag>.<ciphertext>" string from ~/.zcode/v2/credentials.json
 */
export function decryptZcodeValue(encValue, customKey = null) {
  if (!encValue || typeof encValue !== "string" || !encValue.startsWith("enc:v1:")) {
    return encValue;
  }

  const payload = encValue.slice("enc:v1:".length);
  const parts = payload.split(".");
  if (parts.length < 3) return encValue;

  const [ivB64, tagB64, dataB64] = parts;
  const key =
    customKey ||
    crypto
      .createHash("sha256")
      .update(
        `zcode-credential-fallback:${os.platform()}:${os.homedir()}:${os.userInfo().username}`
      )
      .digest();

  try {
    const iv = Buffer.from(ivB64, "base64url");
    const tag = Buffer.from(tagB64, "base64url");
    const data = Buffer.from(dataB64, "base64url");

    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
  } catch (err) {
    return encValue;
  }
}

/**
 * Extract JWT payload claims if readable
 */
function extractJwtClaims(token) {
  if (!token || typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length < 2) return null;
  try {
    const decoded = Buffer.from(parts[1], "base64url").toString("utf8");
    return JSON.parse(decoded);
  } catch {
    return null;
  }
}

/**
 * Parse any JSON credential format provided by the user for ZCode
 * Supports:
 * - Decrypted credentials object
 * - Raw encrypted ~/.zcode/v2/credentials.json file contents
 * - Minimal { "zcodejwttoken": "..." } or { "token": "..." }
 * - Array of any of the above
 */
export function parseZcodeCredentials(input) {
  let parsed = input;
  if (typeof input === "string") {
    const trimmed = input.trim();
    if (!trimmed) throw new Error("Input JSON is empty");
    parsed = JSON.parse(trimmed);
  }

  // Handle wrapped { accounts: [...] }
  if (parsed && typeof parsed === "object" && !Array.isArray(parsed) && Array.isArray(parsed.accounts)) {
    parsed = parsed.accounts;
  }

  const items = Array.isArray(parsed) ? parsed : [parsed];
  const results = [];

  for (const raw of items) {
    if (!raw || typeof raw !== "object") continue;

    // Check possible token keys
    let token =
      raw.zcodejwttoken ||
      raw.token ||
      raw.accessToken ||
      raw.apiKey ||
      raw["oauth:zai:access_token"] ||
      raw["zcode-plan-token"];

    if (typeof token === "string" && token.startsWith("enc:v1:")) {
      token = decryptZcodeValue(token);
    }

    if (!token || typeof token !== "string") {
      continue;
    }

    token = token.trim();

    // Check user info
    let email = raw.email || raw.user?.email || null;
    let name = raw.name || raw.displayName || raw.user?.name || null;
    let userId = raw.userId || raw.user_id || raw.user?.id || raw.user?.user_id || null;

    // Check encrypted user info from official credentials.json
    if (raw["oauth:zai:user_info"]) {
      const decryptedUserInfo = decryptZcodeValue(raw["oauth:zai:user_info"]);
      try {
        const userInfo = JSON.parse(decryptedUserInfo);
        if (!email && userInfo.email) email = userInfo.email;
        if (!name && userInfo.name) name = userInfo.name;
        if (!userId && (userInfo.user_id || userInfo.id)) userId = userInfo.user_id || userInfo.id;
      } catch {}
    }

    // Best-effort extract from JWT claims
    if (!userId || !email) {
      const claims = extractJwtClaims(token);
      if (claims) {
        if (!userId && (claims.user_id || claims.sub)) userId = claims.user_id || claims.sub;
        if (!email && claims.email) email = claims.email;
      }
    }

    const deviceMid = raw.deviceMid || raw.device_id || "242cf487-de63-4edd-b3bb-2e5aa4baaa28";

    results.push({
      token,
      email: email || null,
      name: name || email || (userId ? `ZCode (${String(userId).slice(0, 8)})` : "ZCode Account"),
      userId: userId ? String(userId) : null,
      deviceMid,
      providerSpecificData: {
        zcodeJwtToken: token,
        ...(userId ? { userId: String(userId) } : {}),
        deviceMid,
        authMethod: "json_import",
        importedAt: new Date().toISOString(),
      },
    });
  }

  return results;
}
