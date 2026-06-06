#!/usr/bin/env bun
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { searchImages as bingSearch, toImageResults as bingToResults } from "./bing-search.js";
import { searchPhotos as pexelsSearch } from "./pexels-api.js";
import { searchPhotos as pixabaySearch } from "./pixabay-api.js";
import { searchPhotos as unsplashSearch, toImageResults as unsplashToResults } from "./unsplash-api.js";
import { downloadImages } from "./image-downloader.js";
import { DEFAULT_IMAGE_COUNT } from "./types.js";
import type { DownloadImagesResult, ImageProvider, ImageResult, ProviderDiagnostics } from "./types.js";
import { rankResults } from "./scoring.js";
import { serializeDownloadedImage, serializeFailedDownload, serializeImageResult } from "./serialization.js";

const server = new McpServer({
  name: "image-search-mcp",
  version: "0.2.0",
});

const PROVIDERS: ImageProvider[] = ["pexels", "pixabay", "unsplash", "bing"];

interface SearchAllProvidersResult {
  results: ImageResult[];
  diagnostics: ProviderDiagnostics;
}

function createDiagnostics(): ProviderDiagnostics {
  return Object.fromEntries(
    PROVIDERS.map((provider) => [provider, { status: "skipped", count: 0 }])
  ) as ProviderDiagnostics;
}

function isMissingConfigError(provider: ImageProvider, err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  if (provider === "pexels") return message.includes("PEXELS_API_KEY");
  if (provider === "pixabay") return message.includes("PIXABAY_API_KEY");
  if (provider === "unsplash") return message.includes("UNSPLASH_ACCESS_KEY");
  return false;
}

function bingFiltersForOrientation(orientation?: string) {
  if (orientation === "landscape") return { aspect: "wide" as const };
  if (orientation === "portrait") return { aspect: "tall" as const };
  if (orientation === "squarish") return { aspect: "square" as const };
  return undefined;
}

function formatSearchResults(results: ImageResult[]): string {
  return results
    .map((r, i) => {
      const label = r.description || r.title || r.tags?.join(", ") || "";
      const byline = r.author ? ` by ${r.author}` : "";
      const title = label ? ` - ${label}` : "";
      return `${i + 1}. [${r.provider}] ${r.width}x${r.height}${byline}${title}\n   ${r.downloadUrl}\n   Source: ${r.sourcePage}`;
    })
    .join("\n\n");
}

function formatDownloadResult(result: DownloadImagesResult): string {
  const lines: string[] = [];
  if (result.downloaded.length > 0) {
    lines.push(`Downloaded ${result.downloaded.length} image(s):`);
    result.downloaded.forEach((d) => {
      lines.push(`  ${d.filePath} (${d.width}x${d.height}) [${d.provider}]${d.author ? ` by ${d.author}` : ""}`);
    });
  }
  if (result.failed.length > 0) {
    lines.push(`\nFailed ${result.failed.length}:`);
    result.failed.forEach((f) => lines.push(`  ${f.downloadUrl}: ${f.error}`));
  }
  return lines.join("\n") || "No images downloaded";
}

async function searchAllProviders(
  query: string,
  count: number,
  orientation?: string,
): Promise<SearchAllProvidersResult> {
  const diagnostics = createDiagnostics();
  const tasks: Array<Promise<{ provider: ImageProvider; results: ImageResult[] }>> = [
    pexelsSearch(query, count, orientation)
      .then((results) => ({ provider: "pexels" as const, results })),
    pixabaySearch(query, count, orientation)
      .then((results) => ({ provider: "pixabay" as const, results })),
    unsplashSearch(query, count, 1, "relevant", undefined, orientation)
      .then(({ photos }) => ({ provider: "unsplash" as const, results: unsplashToResults(photos) })),
    bingSearch(query, count * 2, bingFiltersForOrientation(orientation))
      .then((results) => ({ provider: "bing" as const, results: bingToResults(results) })),
  ];

  const settled = await Promise.allSettled(tasks);
  const merged: ImageResult[] = [];
  for (const result of settled) {
    if (result.status === "fulfilled") {
      diagnostics[result.value.provider] = { status: "ok", count: result.value.results.length };
      merged.push(...result.value.results);
      continue;
    }

    const reason = result.reason;
    const message = reason instanceof Error ? reason.message : String(reason);
    const provider = PROVIDERS.find((name) => message.toLowerCase().includes(name)) || (
      message.includes("PEXELS_API_KEY") ? "pexels" :
      message.includes("PIXABAY_API_KEY") ? "pixabay" :
      message.includes("UNSPLASH_ACCESS_KEY") ? "unsplash" :
      "bing"
    );
    if (isMissingConfigError(provider, reason)) {
      diagnostics[provider] = { status: "skipped", count: 0, error: message };
    } else {
      diagnostics[provider] = { status: "error", count: 0, error: message };
      console.error(`${provider}:`, message);
    }
  }

  return {
    results: rankResults(merged, query, count, orientation),
    diagnostics,
  };
}

server.registerTool(
  "image_search",
  {
    title: "Search and Download Images",
    description:
      "Search images from multiple providers (Pexels, Pixabay, Unsplash, Bing) by keyword. " +
      "When save_dir is provided, images are downloaded to that directory. " +
      "When save_dir is omitted, returns URLs and metadata only. " +
      "Providers are tried in priority order; those without API keys are skipped automatically.",
    inputSchema: {
      query: z.string().describe("Search keyword"),
      count: z.number().int().min(1).max(20).optional().describe("Number of images (default: 5, max: 20)"),
      save_dir: z.string().optional().describe("Directory to save images. If provided, downloads images; if omitted, returns URLs only"),
      orientation: z.enum(["landscape", "portrait", "squarish"]).optional().describe("Image orientation filter"),
    },
  },
  async ({ query, count, save_dir, orientation }) => {
    try {
      const num = count ?? DEFAULT_IMAGE_COUNT;
      const searchCount = save_dir ? Math.max(num * 4, 12) : num;
      const { results, diagnostics } = await searchAllProviders(query, searchCount, orientation);
      const selected = results.slice(0, num);

      if (selected.length === 0) {
        return {
          content: [{ type: "text" as const, text: `No images found for "${query}"` }],
          structuredContent: { results: [], diagnostics },
        };
      }

      // Search-only mode
      if (!save_dir) {
        return {
          content: [{ type: "text" as const, text: formatSearchResults(selected) }],
          structuredContent: {
            results: selected.map(serializeImageResult),
            diagnostics,
          },
        };
      }

      // Download mode
      const downloadResult = await downloadImages(results, query, num, save_dir);

      return {
        content: [{ type: "text" as const, text: formatDownloadResult(downloadResult) }],
        structuredContent: {
          directory: downloadResult.directory,
          downloaded: downloadResult.downloaded.map(serializeDownloadedImage),
          failed: downloadResult.failed.map(serializeFailedDownload),
          results: results.map(serializeImageResult),
          diagnostics,
        },
      };
    } catch (err) {
      return {
        content: [{ type: "text" as const, text: `Search failed: ${err instanceof Error ? err.message : String(err)}` }],
        isError: true,
      };
    }
  }
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("image-search-mcp server running on stdio");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
