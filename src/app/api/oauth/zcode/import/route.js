import { NextResponse } from "next/server";
import { createProviderConnection } from "@/models";
import { parseZcodeCredentials } from "open-sse/shared/zcodeCredentials.js";

/**
 * POST /api/oauth/zcode/import
 * Import ZCode accounts from JSON input.
 */
export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch (err) {
    return NextResponse.json(
      { error: `Invalid JSON body: ${err.message}` },
      { status: 400 }
    );
  }

  // Support { jsonText: "..." }, { accounts: [...] }, or raw payload
  const rawInput =
    body && typeof body === "object" && typeof body.jsonText === "string"
      ? body.jsonText
      : body;

  let accounts;
  try {
    accounts = parseZcodeCredentials(rawInput);
  } catch (err) {
    return NextResponse.json(
      { error: `Failed to parse ZCode credentials: ${err.message}` },
      { status: 400 }
    );
  }

  if (!Array.isArray(accounts) || accounts.length === 0) {
    return NextResponse.json(
      {
        error:
          "No valid ZCode credentials found in input. Ensure JSON contains 'token' or 'zcodejwttoken'.",
      },
      { status: 400 }
    );
  }

  const results = [];
  let success = 0;
  let failed = 0;

  for (let i = 0; i < accounts.length; i++) {
    const acc = accounts[i];
    try {
      if (!acc.token) {
        throw new Error("Missing token");
      }

      const created = await createProviderConnection({
        provider: "zcode",
        authType: "oauth",
        name: acc.name || "ZCode Starter",
        email: acc.email || null,
        accessToken: acc.token,
        refreshToken: null,
        providerSpecificData: acc.providerSpecificData,
        testStatus: "active",
        isActive: true,
      });

      results.push({
        index: i,
        ok: true,
        id: created.id,
        name: created.name,
        email: created.email,
      });
      success++;
    } catch (e) {
      results.push({
        index: i,
        ok: false,
        error: e.message || "Unknown error",
      });
      failed++;
    }
  }

  return NextResponse.json({
    success,
    failed,
    results,
    count: success,
  });
}

/**
 * GET /api/oauth/zcode/import
 * Get instructions for importing ZCode credentials
 */
export async function GET() {
  return NextResponse.json({
    provider: "zcode",
    method: "import_json",
    description: "Import ZCode Starter Plan credentials by pasting JSON",
    examples: [
      {
        description:
          "Official ~/.zcode/v2/credentials.json file content (encrypted or decrypted)",
        example:
          '{\n  "zcodejwttoken": "enc:v1:...",\n  "oauth:zai:user_info": "enc:v1:..."\n}',
      },
      {
        description: "Minimal token format",
        example:
          '{\n  "token": "eyJhbGciOi...",\n  "email": "user@example.com"\n}',
      },
      {
        description: "Array of accounts",
        example: '[\n  { "token": "..." },\n  { "token": "..." }\n]',
      },
    ],
  });
}
