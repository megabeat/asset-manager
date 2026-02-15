"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.searchWeb = searchWeb;
function getBingApiKey() {
    const key = process.env.BING_SEARCH_API_KEY ?? "";
    return key.trim().length > 0 ? key.trim() : null;
}
function getBingEndpoint() {
    const configured = process.env.BING_SEARCH_ENDPOINT ?? "https://api.bing.microsoft.com/v7.0/search";
    return configured.trim();
}
async function searchWeb(query, top = 5) {
    const apiKey = getBingApiKey();
    if (!apiKey) {
        return [];
    }
    const endpoint = getBingEndpoint();
    const url = new URL(endpoint);
    url.searchParams.set("q", query);
    url.searchParams.set("mkt", "ko-KR");
    url.searchParams.set("count", String(Math.min(Math.max(top, 1), 10)));
    url.searchParams.set("responseFilter", "Webpages");
    url.searchParams.set("safeSearch", "Moderate");
    const response = await fetch(url.toString(), {
        method: "GET",
        headers: {
            "Ocp-Apim-Subscription-Key": apiKey
        }
    });
    if (!response.ok) {
        throw new Error(`Bing search failed: HTTP ${response.status}`);
    }
    const payload = (await response.json());
    const rows = payload.webPages?.value ?? [];
    return rows
        .map((row) => ({
        title: row.name ?? "",
        url: row.url ?? "",
        snippet: row.snippet ?? "",
        crawledAt: row.dateLastCrawled
    }))
        .filter((row) => row.title.length > 0 && row.url.length > 0)
        .slice(0, top);
}
