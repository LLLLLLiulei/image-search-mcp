import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { downloadImages } from "./image-downloader.js";
import type { ImageResult } from "./types.js";

const originalFetch = globalThis.fetch;

const pngHeader = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x04, 0x00, 0x00, 0x00, 0x03, 0x00,
  0x08, 0x02, 0x00, 0x00, 0x00,
]);
const png1024x768 = new Uint8Array(2048);
png1024x768.set(pngHeader);

function image(downloadUrl: string): ImageResult {
  return {
    provider: "bing",
    width: 1024,
    height: 768,
    downloadUrl,
    sourcePage: "https://example.com/source",
    author: "",
  } as ImageResult;
}

describe("image downloader", () => {
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test("continues through failed candidates until requested count is downloaded", async () => {
    const dir = await mkdtemp(join(tmpdir(), "image-search-mcp-"));
    try {
      const requested: string[] = [];
      globalThis.fetch = (async (input: RequestInfo | URL) => {
        const url = String(input);
        requested.push(url);
        if (url.includes("fail")) {
          return new Response("blocked", { status: 403 });
        }
        return new Response(png1024x768, { headers: { "Content-Type": "image/png" } });
      }) as typeof fetch;

      const result = await downloadImages(
        [image("https://example.com/fail.jpg"), image("https://example.com/success.png")],
        "mountain lake",
        1,
        dir,
      );

      expect(result.downloaded).toHaveLength(1);
      expect(result.failed).toHaveLength(1);
      expect(result.downloaded[0]).toMatchObject({
        provider: "bing",
        width: 1024,
        height: 768,
      });
      expect(requested).toEqual(["https://example.com/fail.jpg", "https://example.com/success.png"]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
