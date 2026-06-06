import type { ImageResult } from "./types.js";

export interface UnsplashPhoto {
  id: string;
  description: string | null;
  alt_description?: string | null;
  urls: {
    raw: string;
    full: string;
    regular: string;
    small: string;
    thumb: string;
  };
  width: number;
  height: number;
  links: {
    html: string;
    download_location?: string;
  };
  user: {
    name: string;
    links?: {
      html?: string;
    };
  };
}

const API_BASE = "https://api.unsplash.com";

function getAccessKey(): string {
  const key = process.env.UNSPLASH_ACCESS_KEY;
  if (!key) throw new Error("Missing UNSPLASH_ACCESS_KEY environment variable");
  return key;
}

const API_HEADERS = () => ({
  "Accept-Version": "v1",
  "Authorization": `Client-ID ${getAccessKey()}`,
});

export async function searchPhotos(
  query: string,
  perPage = 10,
  page = 1,
  orderBy = "relevant",
  color?: string,
  orientation?: string,
): Promise<{ photos: UnsplashPhoto[]; total: number }> {
  const params: Record<string, string> = {
    query,
    per_page: String(Math.min(perPage, 30)),
    page: String(page),
    order_by: orderBy,
  };
  if (color) params.color = color;
  if (orientation) params.orientation = orientation;

  const qs = new URLSearchParams(params).toString();
  const response = await fetch(`${API_BASE}/search/photos?${qs}`, {
    headers: API_HEADERS(),
    signal: AbortSignal.timeout(15000),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Unsplash API error: ${response.status} - ${text}`);
  }

  const data = await response.json() as {
    results: UnsplashPhoto[];
    total: number;
  };

  return { photos: data.results, total: data.total };
}

export function buildDownloadUrl(rawUrl: string, width = 2400, quality = 85): string {
  return `${rawUrl}&w=${width}&q=${quality}&fm=jpg`;
}

export function toImageResults(photos: UnsplashPhoto[]): ImageResult[] {
  return photos.map((p) => ({
    id: p.id,
    url: p.urls.regular,
    downloadUrl: p.urls.regular,
    previewUrl: p.urls.small || p.urls.regular,
    thumbnailUrl: p.urls.thumb || p.urls.small,
    width: p.width,
    height: p.height,
    provider: "unsplash",
    author: p.user.name,
    authorUrl: p.user.links?.html || "",
    sourcePage: p.links.html,
    title: p.description || p.alt_description || "",
    description: p.description || p.alt_description || "",
    downloadTrackingUrl: p.links.download_location || "",
    licenseName: "Unsplash License",
    licenseUrl: "https://unsplash.com/license",
    attributionRequired: false,
    attributionText: p.user.name ? `Photo by ${p.user.name} on Unsplash` : "Photo on Unsplash",
    raw: p,
  }));
}
