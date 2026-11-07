import { NextResponse } from "next/server";
import { readFile } from "fs/promises";
import { homedir } from "os";
import { join } from "path";
import { parseZcodeCredentials } from "open-sse/shared/zcodeCredentials.js";

/**
 * GET /api/oauth/zcode/auto-import
 * Auto-detect and parse ZCode credentials from ~/.zcode/v2/credentials.json
 */
export async function GET() {
  try {
    const candidatePaths = [
      join(homedir(), ".zcode", "v2", "credentials.json"),
      join(homedir(), ".zcode", "credentials.json"),
    ];

    let foundPath = null;
    let content = null;

    for (const p of candidatePaths) {
      try {
        content = await readFile(p, "utf-8");
        foundPath = p;
        break;
      } catch {
        continue;
      }
    }

    if (!foundPath || !content) {
      return NextResponse.json({
        found: false,
        error: "ZCode credentials file not found in ~/.zcode/v2/credentials.json",
      });
    }

    const accounts = parseZcodeCredentials(content);
    if (!accounts || accounts.length === 0) {
      return NextResponse.json({
        found: false,
        error: "Found credentials.json, but no valid ZCode credentials could be extracted.",
      });
    }

    return NextResponse.json({
      found: true,
      path: foundPath,
      count: accounts.length,
      accounts: accounts.map((acc) => ({
        name: acc.name,
        email: acc.email,
        userId: acc.userId,
        deviceMid: acc.deviceMid,
        token: acc.token,
        providerSpecificData: acc.providerSpecificData,
      })),
    });
  } catch (error) {
    console.error("ZCode auto-import error:", error);
    return NextResponse.json(
      { found: false, error: error.message },
      { status: 500 }
    );
  }
}
