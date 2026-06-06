import type { ImageResult } from "./types.js";

const API_URL = "https://pixabay.com/api/";
const DEFAULT_TIMEOUT = 15000;

const ORIENTATION_MAP: Record<string, string> = {
  landscape: "horizontal",
  portrait: "vertical",
};

interface PixabayHit {
  id: number;
  pageURL: string;
  imageURL?: string;
  fullHDURL?: string;
  largeImageURL: string;
  webformatURL: string;
  previewURL: string;
  imageWidth: number;
  imageHeight: number;
  imageSize?: number;
  webformatWidth?: number;
  webformatHeight?: number;
  previewWidth?: number;
  previewHeight?: number;
  user: string;
  user_id?: number;
  userImageURL?: string;
  tags: string;
}

function getApiKey(): string {
  const key = (process.env.PIXABAY_API_KEY || "").trim();
  if (!key) throw new Error("PIXABAY_API_KEY not configured");
  return key;
}

function pickDownloadUrl(hit: PixabayHit): string {
  return hit.imageURL || hit.fullHDURL || hit.largeImageURL || hit.webformatURL || hit.previewURL || "";
}

function normalizeQuery(query: string): string {
  const trimmed = query.trim().replace(/\s+/g, " ");
  if (trimmed.length <= 100) return trimmed;
  const words = trimmed.split(" ");
  const kept: string[] = [];
  for (const word of words) {
    const next = [...kept, word].join(" ");
    if (next.length > 100) break;
    kept.push(word);
  }
  return (kept.join(" ") || trimmed.slice(0, 100)).trim();
}

function clampPerPage(perPage: number): number {
  return Math.min(Math.max(Math.trunc(perPage), 3), 200);
}

function parseTags(tags: string): string[] {
  return tags.split(",").map((tag) => tag.trim()).filter(Boolean);
}

function parseResults(hits: PixabayHit[]): ImageResult[] {
  const results: ImageResult[] = [];
  for (const item of hits) {
    const downloadUrl = pickDownloadUrl(item);
    if (!downloadUrl) continue;
    const tags = parseTags(item.tags || "");
    const temporaryUrl = downloadUrl === item.webformatURL || downloadUrl === item.previewURL;
    results.push({
      id: String(item.id || ""),
      url: downloadUrl,
      downloadUrl,
      previewUrl: item.webformatURL || item.largeImageURL || item.previewURL || "",
      thumbnailUrl: item.previewURL || item.webformatURL || "",
      width: item.imageWidth || 0,
      height: item.imageHeight || 0,
      provider: "pixabay",
      author: item.user || "",
      authorId: item.user_id ? String(item.user_id) : "",
      authorAvatarUrl: item.userImageURL || "",
      sourcePage: item.pageURL || "",
      title: item.tags || "",
      description: item.tags || "",
      tags,
      licenseName: "Pixabay Content License",
      licenseUrl: "https://pixabay.com/service/license-summary/",
      attributionRequired: false,
      attributionText: item.user ? `Image by ${item.user} on Pixabay` : "Image on Pixabay",
      temporaryUrl,
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
    key: apiKey,
    q: normalizeQuery(query),
    image_type: "photo",
    safesearch: "true",
    per_page: String(clampPerPage(perPage)),
  };

  const mappedOrientation = orientation ? ORIENTATION_MAP[orientation] : undefined;
  if (mappedOrientation) params.orientation = mappedOrientation;

  const qs = new URLSearchParams(params).toString();
  const response = await fetch(`${API_URL}?${qs}`, {
    headers: {
      "User-Agent": "image-search-mcp/1.0",
    },
    signal: AbortSignal.timeout(DEFAULT_TIMEOUT),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Pixabay API error: ${response.status} - ${text}`);
  }

  const data = await response.json() as { hits: PixabayHit[] };
  return parseResults(data.hits || []);
}
