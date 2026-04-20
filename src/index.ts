#!/usr/bin/env bun
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { searchImages } from "./bing-search.js";
import { downloadImages } from "./image-downloader.js";
import { DEFAULT_IMAGE_COUNT } from "./types.js";

const server = new McpServer({
  name: "image-search-mcp",
  version: "0.1.0",
});

server.registerTool(
  "search_images",
  {
    title: "Search Images",
    description: "Search images from Bing by keyword. Returns a list of image URLs with metadata (thumbnail, dimensions, source page).",
    inputSchema: {
      keyword: z.string().describe("Search keyword for images"),
      count: z.number().optional().describe("Number of images to return (default: 5)"),
    },
    outputSchema: {
      images: z.array(z.object({
        url: z.string().describe("Original image URL"),
        thumbnailUrl: z.string().describe("Thumbnail image URL"),
        width: z.number().describe("Image width in pixels"),
        height: z.number().describe("Image height in pixels"),
        sourcePage: z.string().describe("Source webpage URL"),
      })).describe("List of search results"),
      total: z.number().describe("Total number of results returned"),
    },
  },
  async ({ keyword, count }) => {
    try {
      const results = await searchImages(keyword, count ?? DEFAULT_IMAGE_COUNT);
      if (results.length === 0) {
        return {
          content: [{ type: "text" as const, text: `No images found for "${keyword}"` }],
          structuredContent: { images: [], total: 0 },
        };
      }
      const text = results
        .map(
          (r, i) =>
            `${i + 1}. ${r.url}\n   Size: ${r.width}x${r.height} | Source: ${r.sourcePage}`
        )
        .join("\n\n");
      return {
        content: [{ type: "text" as const, text }],
        structuredContent: { images: results, total: results.length },
      };
    } catch (err) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Search failed: ${err instanceof Error ? err.message : String(err)}`,
          },
        ],
        isError: true,
      };
    }
  }
);

server.registerTool(
  "download_images",
  {
    title: "Download Images",
    description: "Search images from Bing by keyword, filter by size, and download to local directory. Returns local file paths.",
    inputSchema: {
      keyword: z.string().describe("Search keyword for images"),
      count: z.number().optional().describe("Number of images to download (default: 5)"),
      save_dir: z.string().optional().describe("Directory to save images (default: ./images)"),
    },
    outputSchema: {
      downloaded: z.array(z.object({
        filePath: z.string().describe("Local file path of the saved image"),
        width: z.number().describe("Image width in pixels"),
        height: z.number().describe("Image height in pixels"),
      })).describe("Successfully downloaded images"),
      failed: z.array(z.object({
        filePath: z.string().describe("Intended file path"),
        error: z.string().describe("Error message"),
      })).describe("Failed downloads"),
      saveDirectory: z.string().describe("Directory where images were saved"),
    },
  },
  async ({ keyword, count, save_dir }) => {
    try {
      const searchResults = await searchImages(keyword, (count ?? DEFAULT_IMAGE_COUNT) * 2);
      if (searchResults.length === 0) {
        return {
          content: [{ type: "text" as const, text: `No images found for "${keyword}"` }],
          structuredContent: { downloaded: [], failed: [], saveDirectory: save_dir ?? "images" },
        };
      }
      const results = await downloadImages(
        searchResults,
        keyword,
        count ?? DEFAULT_IMAGE_COUNT,
        save_dir ?? "images"
      );
      const succeeded = results.filter((r) => r.success);
      const failed = results.filter((r) => !r.success);

      const lines: string[] = [];
      if (succeeded.length > 0) {
        lines.push(`Downloaded ${succeeded.length} image(s):`);
        succeeded.forEach((r) => lines.push(`  ${r.filePath}`));
      }
      if (failed.length > 0) {
        lines.push(`\nFailed ${failed.length} image(s):`);
        failed.forEach((r) => lines.push(`  ${r.filePath}: ${r.error}`));
      }
      return {
        content: [{ type: "text" as const, text: lines.join("\n") }],
        structuredContent: {
          downloaded: succeeded.map((r) => ({ filePath: r.filePath, width: r.width, height: r.height })),
          failed: failed.map((r) => ({ filePath: r.filePath, error: r.error ?? "unknown" })),
          saveDirectory: save_dir ?? "images",
        },
      };
    } catch (err) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Download failed: ${err instanceof Error ? err.message : String(err)}`,
          },
        ],
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
