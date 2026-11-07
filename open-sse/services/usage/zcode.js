/**
 * ZCode Starter Plan token usage
 */

import { proxyAwareFetch } from "../../utils/proxyFetch.js";
import { U, toFiniteNumber } from "./shared.js";

export async function getZcodeUsage(token, providerSpecificData = {}, proxyOptions = null) {
  if (!token) {
    return { message: "ZCode token not available." };
  }

  const quotaUrl = U("zcode")?.url || "https://zcode.z.ai/api/v1/zcode-plan/billing/balance?app_version=3.17.2";
  const deviceMid = providerSpecificData?.deviceMid || "242cf487-de63-4edd-b3bb-2e5aa4baaa28";

  try {
    const response = await proxyAwareFetch(
      quotaUrl,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          "x-api-key": token,
          "X-Device-Mid": deviceMid,
          "User-Agent": "ZCode/3.17.2 ai-sdk/provider-utils/4.0.27 runtime/node.js/26",
          "x-zcode-app-version": "3.17.2",
          "x-title": "Z Code@cli",
          Accept: "application/json",
        },
      },
      proxyOptions,
    );

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        return { message: "ZCode session expired or invalid credentials." };
      }
      return { message: `ZCode balance API error (${response.status}).` };
    }

    const json = await response.json();
    if (!json?.data || (json.code !== 0 && json.code !== 200)) {
      return { message: json?.msg || "Failed to fetch ZCode balance." };
    }

    const data = json.data;
    const planName = data.plans?.[0]?.name || "Starter Plan";
    const bal = Array.isArray(data.balances) && data.balances.length > 0 ? data.balances[0] : data;

    const total = toFiniteNumber(bal.total_units, 500000000);
    const used = toFiniteNumber(bal.used_units, 0);
    const remaining = toFiniteNumber(bal.remaining_units ?? bal.available_units, Math.max(0, total - used));
    const remainingPercentage = total > 0 ? Number(((remaining / total) * 100).toFixed(2)) : 0;
    const usedPercentage = total > 0 ? Number(((used / total) * 100).toFixed(2)) : 0;
    const expiresAt = bal.expires_at ? new Date(bal.expires_at * 1000).toISOString() : null;

    const modelLabel = bal.show_name || "GLM-5.3-Flash";

    const quotas = {
      [modelLabel]: {
        used: usedPercentage,
        total: 100,
        remaining: remainingPercentage,
        remainingPercentage,
        resetAt: expiresAt,
        unlimited: false,
      },
    };

    return {
      plan: planName,
      quotas,
    };
  } catch (error) {
    return { message: `ZCode error: ${error.message}` };
  }
}
