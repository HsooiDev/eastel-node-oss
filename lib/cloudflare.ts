const CF_API_URL = "https://api.cloudflare.com/client/v4";

async function cfRequest(method: string, path: string, body?: Record<string, unknown>) {
  const token = process.env.CF_API_TOKEN;
  const zoneId = process.env.CF_ZONE_ID;
  if (!token || !zoneId) throw new Error("CF_API_TOKEN and CF_ZONE_ID must be set");

  const url = `${CF_API_URL}/zones/${zoneId}${path}`;
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = await res.json();
  if (!data.success) {
    throw new Error(data.errors?.[0]?.message || "Cloudflare API error");
  }
  return data.result;
}

export async function purgeCache(urls?: string[]) {
  const body = urls ? { files: urls } : { purge_everything: true };
  return cfRequest("POST", "/purge_cache", body);
}

export async function getAnalytics(since: string, until: string) {
  return cfRequest("GET", `/analytics/dashboard?since=${since}&until=${until}`);
}

export async function getZoneInfo() {
  return cfRequest("GET", "");
}

export async function toggleDevMode(on: boolean) {
  return cfRequest("PATCH", "/settings/development_mode", { value: on ? "on" : "off" });
}
