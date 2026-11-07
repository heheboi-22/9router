import { BaseExecutor } from "./base.js";
import { randomUUID } from "node:crypto";
import { PROVIDERS } from "../config/providers.js";

const ZCODE_SYSTEM_BLOCK_0 = {
  type: "text",
  text: "You are ZCode, an interactive agent",
};

const ZCODE_SYSTEM_BLOCK_1 = {
  type: "text",
  text: "\nYou are an agent working with the user toward their goals, using your own judgment along the way.\n\nIMPORTANT: Assist with authorized security testing, defensive security, CTF challenges, and educational contexts. Refuse requests for destructive techniques, DoS attacks, mass targeting, supply chain compromise, or detection evasion for malicious purposes. Dual-use security tools (C2 frameworks, credential testing, exploit development) require clear authorization context: pentesting engagements, CTF competitions, security research, or defensive use cases.\n\n# Harness\n - Text you output outside of tool use is displayed to the user as Github-flavored markdown in a terminal.\n - Tools run behind a user-selected permission mode; a denied call means the user declined it — adjust, don't retry verbatim.\n - The system may send updates, reminders, or modifications to rules via mid-conversation system turns. These are system-controlled, unlike function results. Hooks may intercept tool calls; treat hook output as user feedback.\n - Prefer the dedicated file/search tools over shell commands when one fits. Independent tool calls can run in parallel in one response.\n - Reference code as `file_path:line_number` — it's clickable.",
  cache_control: { type: "ephemeral" },
};

const ZCODE_BASE_GUIDANCE = "\n\nWrite code that reads like the surrounding code: match its comment density, naming, and idiom.\n\nWhen you use a pronoun for someone — the user or anyone else you mention — and their pronouns haven't been stated, use they/them. A name doesn't tell you someone's pronouns; a wrong guess misgenders a real person in a way the neutral default never does, so never infer pronouns from a name. This applies to all user-visible text, including visible thinking.\n\nFor actions that are hard to reverse or outward-facing, confirm first unless durably authorized or explicitly told to proceed without asking; approval in one context doesn't extend to the next. Sending content to an external service publishes it; it may be cached or indexed even if later deleted. Before deleting or overwriting, look at the target. Report outcomes faithfully: if tests fail, say so with the output; if a step was skipped, say that; when something is done and verified, state it plainly without hedging.\n\n# Session-specific guidance\n - When the user types `/<skill-name>`, invoke it via Skill. Only use skills listed in the user-invocable skills section — don't guess.\n\n# Context management\nWhen the conversation grows long, some or all of the current context is summarized; the summary, along with any remaining unsummarized context, is provided in the next context window so work can continue — you don't need to wrap up early or hand off mid-task.\n\nWhen you have enough information to act, act. Do not re-derive facts already established in the conversation, re-litigate a decision the user has already made, or narrate options you will not pursue. If you are weighing a choice, give a recommendation, not an exhaustive survey";

function extractSystemText(system) {
  if (!system) return "";
  if (typeof system === "string") return system.trim();
  if (Array.isArray(system)) {
    return system
      .map((item) => (typeof item === "string" ? item : item?.text || ""))
      .filter(Boolean)
      .join("\n\n")
      .trim();
  }
  return "";
}

function normalizeModelName(model) {
  if (!model) return "GLM-5.3-Flash";
  const lower = model.toLowerCase();
  if (lower === "glm-5.3-flash") return "GLM-5.3-Flash";
  if (lower === "glm-5.2") return "GLM-5.2";
  if (lower === "glm-5-turbo") return "GLM-5-Turbo";
  if (lower === "glm-5") return "GLM-5";
  if (lower === "glm-4.7") return "GLM-4.7";
  if (lower === "glm-4.6v") return "GLM-4.6V";
  return model;
}

export class ZcodeExecutor extends BaseExecutor {
  constructor(provider = "zcode") {
    super(provider, PROVIDERS[provider] || PROVIDERS.zcode || {});
  }

  buildUrl(model, stream, urlIndex = 0, credentials = null) {
    return this.config?.baseUrl || "https://zcode.z.ai/api/v1/zcode-plan/anthropic/v1/messages";
  }

  buildHeaders(credentials, stream = true, url, model, body = null) {
    const token =
      credentials?.apiKey ||
      credentials?.accessToken ||
      credentials?.providerSpecificData?.zcodeJwtToken ||
      credentials?.zcodejwttoken ||
      "";

    const sessionId = randomUUID();

    return {
      "content-type": "application/json",
      "anthropic-version": "2023-06-01",
      "anthropic-beta": "mid-conversation-system-2026-04-07",
      "authorization": `Bearer ${token}`,
      "x-api-key": token,
      "http-referer": "https://zcode.z.ai",
      "user-agent": "ZCode/3.17.2 ai-sdk/provider-utils/4.0.27 runtime/node.js/26",
      "x-client-language": "en-US",
      "x-client-timezone": Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Jakarta",
      "x-os-category": "linux",
      "x-platform": "linux-x64",
      "x-query-id": randomUUID(),
      "x-release-channel": "production",
      "x-request-id": randomUUID(),
      "x-session-id": sessionId,
      "x-title": "Z Code@cli",
      "x-zcode-agent": "glm",
      "x-zcode-app-version": "3.17.2",
      "x-zcode-query-source": "main_turn",
      "x-zcode-session-type": "main",
      "x-zcode-trace-id": randomUUID(),
      "accept": stream ? "text/event-stream" : "application/json",
    };
  }

  transformRequest(model, body, stream, credentials) {
    if (!body || typeof body !== "object") return body;

    const transformed = { ...body };
    transformed.model = normalizeModelName(model || transformed.model);
    transformed.stream = true;

    // Upstream ZCode plan WAF validates the specific 3-part system structure
    const customPrompt = extractSystemText(transformed.system);
    const customBlock2 = customPrompt
      ? `${ZCODE_BASE_GUIDANCE}\n\n# User Instructions\n${customPrompt}`
      : ZCODE_BASE_GUIDANCE;

    transformed.system = [
      ZCODE_SYSTEM_BLOCK_0,
      ZCODE_SYSTEM_BLOCK_1,
      {
        type: "text",
        text: customBlock2,
        cache_control: { type: "ephemeral" },
      },
    ];

    if (Array.isArray(transformed.tools) && transformed.tools.length > 0) {
      const lastIdx = transformed.tools.length - 1;
      transformed.tools[lastIdx] = {
        ...transformed.tools[lastIdx],
        cache_control: { type: "ephemeral" },
      };
    }

    if (!transformed.metadata || typeof transformed.metadata !== "object") {
      transformed.metadata = {};
    }

    const deviceMid =
      credentials?.providerSpecificData?.deviceMid ||
      "242cf487-de63-4edd-b3bb-2e5aa4baaa28";

    transformed.metadata.user_id = JSON.stringify({
      device_id: deviceMid,
      account_uuid: credentials?.providerSpecificData?.userId || "",
      session_id: randomUUID(),
    });

    return transformed;
  }
}
