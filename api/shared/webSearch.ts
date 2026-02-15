type BingWebPage = {
  name?: string;
  url?: string;
  snippet?: string;
  dateLastCrawled?: string;
};

type BingResponse = {
  webPages?: {
    value?: BingWebPage[];
  };
};

export type WebSearchItem = {
  title: string;
  url: string;
  snippet: string;
  crawledAt?: string;
};

function getBingApiKey(): string | null {
  const key = process.env.BING_SEARCH_API_KEY ?? "";
  return key.trim().length > 0 ? key.trim() : null;
}

function getBingEndpoint(): string {
  const configured = process.env.BING_SEARCH_ENDPOINT ?? "https://api.bing.microsoft.com/v7.0/search";
  return configured.trim();
}

export async function searchWeb(query: string, top = 5): Promise<WebSearchItem[]> {
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

  const payload = (await response.json()) as BingResponse;
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
