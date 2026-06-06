import type { ImageResult } from "./types.js";

const API_URL = "https://api.pexels.com/v1/search";
const DEFAULT_TIMEOUT = 15000;

const ORIENTATION_MAP: Record<string, string> = {
  landscape: "landscape",
  portrait: "portrait",
  squarish: "square",
};

interface PexelsPhoto {
  id: number;
  width: number;
  height: number;
  url: string;
  photographer: string;
  photographer_url?: string;
  photographer_id?: number;
  avg_color?: string;
  alt: string;
  src: {
    original: string;
    large2x: string;
    large: string;
    medium: string;
    small: string;
    tiny?: string;
    portrait?: string;
    landscape?: string;
  };
}

function getApiKey(): string {
  const key = (process.env.PEXELS_API_KEY || "").trim();
  if (!key) throw new Error("PEXELS_API_KEY not configured");
  return key;
}

function pickDownloadUrl(src: PexelsPhoto["src"]): string {
  return src.original || src.large2x || src.large || "";
}

function buildAttribution(photo: PexelsPhoto): string {
  const author = photo.photographer || "Pexels photographer";
  return `Photo by ${author} on Pexels`;
}

function parseResults(photos: PexelsPhoto[]): ImageResult[] {
  const results: ImageResult[] = [];
  for (const item of photos) {
    const downloadUrl = pickDownloadUrl(item.src);
    if (!downloadUrl) continue;
    const thumbnailUrl = item.src.medium || item.src.small || item.src.tiny || "";
    const previewUrl = item.src.large2x || item.src.large || thumbnailUrl;
    results.push({
      id: String(item.id || ""),
      url: downloadUrl,
      downloadUrl,
      previewUrl,
      thumbnailUrl,
      width: item.width || 0,
      height: item.height || 0,
      provider: "pexels",
      author: item.photographer || "",
      authorUrl: item.photographer_url || "",
      sourcePage: item.url || "",
      title: item.alt || "",
      description: item.alt || "",
      dominantColor: item.avg_color || "",
      licenseName: "Pexels License",
      licenseUrl: "https://www.pexels.com/license/",
      attributionRequired: false,
      attributionText: buildAttribution(item),
      raw: item,
    });
  }
  return results;
}

export async function searchPhotos(
  query: string,
  perPage = 10,
  orientation?: string,
): Promise<ImageResult[]> {
  const apiKey = getApiKey();

  const params: Record<string, string> = {
    query,
    per_page: String(Math.min(perPage, 80)),
    size: "large",
  };

  const mappedOrientation = orientation ? ORIENTATION_MAP[orientation] : undefined;
  if (mappedOrientation) params.orientation = mappedOrientation;

  const qs = new URLSearchParams(params).toString();
  const response = await fetch(`${API_URL}?${qs}`, {
    headers: {
      Authorization: apiKey,
      "User-Agent": "image-search-mcp/1.0",
    },
    signal: AbortSignal.timeout(DEFAULT_TIMEOUT),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Pexels API error: ${response.status} - ${text}`);
  }

  const data = await response.json() as { photos: PexelsPhoto[] };
  return parseResults(data.photos || []);
}
