import type { ImageResult } from "./types.js";

const PROVIDER_PRIORITY: Record<string, number> = {
  pexels: 400,
  pixabay: 300,
  unsplash: 200,
  bing: 100,
};

const INFRASTRUCTURE_TERMS = [
  "station", "subway", "metro", "rail", "transit", "airport", "bus",
  "地铁", "站", "轨道",
];

function queryTokens(query: string): string[] {
  const cleaned = query.replace(/#[0-9a-fA-F]{3,8}/g, "").replace(/\([^)]*\)/g, "");
  const words = cleaned
    .split(/\s+/)
    .map((w) => w.replace(/[.,;:!?'\"()\[\]{}<>\/_~@#$%^&*+=|\\`-]/g, ""));
  return words.filter((w) => w.length > 2 && /^[\x20-\x7E]+$/.test(w));
}

function candidateText(img: ImageResult): string {
  const parts = [
    img.title || "",
    img.description || "",
    ...(img.tags || []),
    img.author || "",
    img.sourcePage || "",
  ].filter(Boolean);
  return parts.join(" ").toLowerCase();
}

function computeRelevance(img: ImageResult, query: string): number {
  const tokens = queryTokens(query);
  if (tokens.length === 0) return 1.0;
  const text = candidateText(img);
  if (!text) return 0.0;
  const hits = tokens.filter((t) => text.includes(t.toLowerCase())).length;
  return hits / tokens.length;
}

function hasQueryTokens(query: string): boolean {
  return queryTokens(query).length > 0;
}

export function normalizeOrientation(width: number, height: number): string {
  if (width === 0 || height === 0) return "unknown";
  const ratio = width / height;
  if (ratio > 1.2) return "landscape";
  if (ratio < 0.8) return "portrait";
  return "squarish";
}

export function filterByOrientation(results: ImageResult[], orientation?: string): ImageResult[] {
  if (!orientation) return results;
  const matching = results.filter((img) => normalizeOrientation(img.width, img.height) === orientation);
  return matching.length > 0 ? matching : results;
}

export function dedupeResults(results: ImageResult[]): ImageResult[] {
  const seen = new Set<string>();
  const deduped: ImageResult[] = [];
  for (const img of results) {
    const keys = [
      img.id ? `${img.provider}:${img.id}` : "",
      img.downloadUrl || img.url || "",
      img.sourcePage || "",
    ].filter(Boolean);
    const duplicate = keys.some((key) => seen.has(key));
    if (duplicate) continue;
    for (const key of keys) seen.add(key);
    deduped.push(img);
  }
  return deduped;
}

export function scoreImage(img: ImageResult, query: string, orientation?: string): number {
  // Provider priority baseline
  let score = PROVIDER_PRIORITY[img.provider] ?? 0;

  // Relevance scoring (dominant factor)
  const relevance = computeRelevance(img, query);
  if (queryTokens(query).length > 0 && relevance === 0) {
    score -= 10000;
  }
  score += relevance * 10000;

  // Infrastructure word penalty
  const text = candidateText(img);
  const queryLower = query.toLowerCase();
  const queryHasInfra = INFRASTRUCTURE_TERMS.some((t) => queryLower.includes(t));
  if (!queryHasInfra && INFRASTRUCTURE_TERMS.some((t) => text.includes(t))) {
    score -= 5000;
  }

  // Orientation match
  if (orientation) {
    const candidateOrientation = normalizeOrientation(img.width, img.height);
    if (candidateOrientation === orientation) {
      score += 1000;
    } else {
      score -= 250;
    }
  }

  // Resolution bonus (capped to avoid size dominating over quality)
  const pixels = Math.max(img.width, 0) * Math.max(img.height, 0);
  score += Math.min(pixels / 1000, 5000);

  // Minimum size penalty
  if (img.width > 0 && img.width < 200) score -= 500;
  if (img.height > 0 && img.height < 200) score -= 500;

  return score;
}

export function rankResults(results: ImageResult[], query: string, count: number, orientation?: string): ImageResult[] {
  const candidates = filterByOrientation(dedupeResults(results), orientation);
  const requireRelevance = hasQueryTokens(query);
  const relevant = requireRelevance
    ? candidates.filter((img) => computeRelevance(img, query) > 0)
    : candidates;
  const scored = relevant.map((img) => ({ img, score: scoreImage(img, query, orientation) }));
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, count).map((s) => s.img);
}
