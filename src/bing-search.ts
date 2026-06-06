import * as cheerio from "cheerio";
import { type SearchResult, type ImageResult, DEFAULT_IMAGE_COUNT, MAX_RETRIES, REQUEST_TIMEOUT } from "./types.js";
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
        title: data.t || data.pt || "",
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

export interface BingFilterOptions {
  size?: "small" | "medium" | "large" | "wallpaper";
  color?: "color" | "bw" | "red" | "orange" | "yellow" | "green" | "teal" | "blue" | "purple" | "pink" | "brown" | "black" | "gray" | "white";
  type?: "photo" | "clipart" | "linedrawing" | "animatedgif" | "transparent";
  aspect?: "square" | "wide" | "tall";
  license?: "anyCreativeCommons" | "publicDomain" | "freeShareAndUse" | "freeShareAndUseCommercially" | "freeModifyShareAndUse" | "freeModifyShareAndUseCommercially";
}

const COLOR_MAP: Record<string, string> = {
  color: "color2-color",
  bw: "color2-bw",
  red: "color2-FGcls_RED",
  orange: "color2-FGcls_ORANGE",
  yellow: "color2-FGcls_YELLOW",
  green: "color2-FGcls_GREEN",
  teal: "color2-FGcls_TEAL",
  blue: "color2-FGcls_BLUE",
  purple: "color2-FGcls_PURPLE",
  pink: "color2-FGcls_PINK",
  brown: "color2-FGcls_BROWN",
  black: "color2-FGcls_BLACK",
  gray: "color2-FGcls_GRAY",
  white: "color2-FGcls_WHITE",
};

const LICENSE_MAP: Record<string, string> = {
  anyCreativeCommons: "licenseType-Any",
  publicDomain: "license-L1",
  freeShareAndUse: "license-L2_L3_L4_L5_L6_L7",
  freeShareAndUseCommercially: "license-L2_L3_L4",
  freeModifyShareAndUse: "license-L2_L3_L5_L6",
  freeModifyShareAndUseCommercially: "license-L2_L3",
};

function buildFilterQuery(filters?: BingFilterOptions): string {
  if (!filters) return "";
  const parts: string[] = [];
  if (filters.size) parts.push(`filterui:imagesize-${filters.size}`);
  if (filters.color) parts.push(`filterui:${COLOR_MAP[filters.color]}`);
  if (filters.type) parts.push(`filterui:photo-${filters.type}`);
  if (filters.aspect) parts.push(`filterui:aspect-${filters.aspect}`);
  if (filters.license) parts.push(`filterui:${LICENSE_MAP[filters.license]}`);
  return parts.length > 0 ? `+${parts.join("+")}` : "";
}

export async function searchImages(
  keyword: string,
  count = DEFAULT_IMAGE_COUNT,
  filters?: BingFilterOptions
): Promise<SearchResult[]> {
  const query = encodeURIComponent(keyword);
  const qft = buildFilterQuery(filters);
  const url = `https://www.bing.com/images/search?q=${query}&first=1&count=${Math.min(count * 2, 35)}&qft=${qft}`;

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

export function toImageResults(results: SearchResult[]): ImageResult[] {
  return results.map((r) => ({
    url: r.url,
    downloadUrl: r.url,
    previewUrl: r.thumbnailUrl,
    width: r.width,
    height: r.height,
    provider: "bing",
    author: "",
    sourcePage: r.sourcePage,
    thumbnailUrl: r.thumbnailUrl,
    title: r.title || "",
    description: r.title || "",
  }));
}
