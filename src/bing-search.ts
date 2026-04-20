import * as cheerio from "cheerio";
import { type SearchResult, DEFAULT_IMAGE_COUNT, MAX_RETRIES, REQUEST_TIMEOUT } from "./types.js";
import { parseImageDimensions } from "./image-downloader.js";

const USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
];

function getRandomUA(): string {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

function isSvgUrl(url: string): boolean {
  return /\.svg(\?|$)/i.test(url);
}

async function fetchWithRetry(url: string, retries = MAX_RETRIES): Promise<string> {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const response = await fetch(url, {
        headers: { "User-Agent": getRandomUA() },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.text();
    } catch (err) {
      if (attempt === retries - 1) throw err;
      const delay = Math.pow(2, attempt) * 500;
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw new Error("Max retries exceeded");
}

function parseImageElements(html: string, maxCount: number): SearchResult[] {
  const $ = cheerio.load(html);
  const seen = new Set<string>();
  const results: SearchResult[] = [];

  $("a.iusc").each((_, el) => {
    if (results.length >= maxCount) return false;

    const m = $(el).attr("m");
    if (!m) return;

    try {
      const data = JSON.parse(m);
      const url: string = data.murl;
      if (!url || seen.has(url) || isSvgUrl(url)) return;

      seen.add(url);
      results.push({
        url,
        thumbnailUrl: data.turl || "",
        width: data.tw || 0,
        height: data.th || 0,
        sourcePage: data.purl || "",
      });
    } catch {
      // skip malformed JSON
    }
  });

  return results;
}

async function fetchImageDimensions(imageUrl: string): Promise<{ width: number; height: number }> {
  try {
    const response = await fetch(imageUrl, {
      headers: {
        "User-Agent": getRandomUA(),
        Range: "bytes=0-65536",
      },
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return { width: 0, height: 0 };
    const buf = await response.arrayBuffer();
    return parseImageDimensions(buf);
  } catch {
    return { width: 0, height: 0 };
  }
}

export async function searchImages(
  keyword: string,
  count = DEFAULT_IMAGE_COUNT
): Promise<SearchResult[]> {
  const query = encodeURIComponent(keyword);
  const url = `https://www.bing.com/images/search?q=${query}&first=1&count=${Math.min(count * 2, 35)}`;

  const html = await fetchWithRetry(url);
  const results = parseImageElements(html, count);

  const enriched = await Promise.all(
    results.map(async (r) => {
      if (r.width > 0 && r.height > 0) return r;
      const dims = await fetchImageDimensions(r.url);
      return { ...r, ...dims };
    })
  );

  return enriched;
}
