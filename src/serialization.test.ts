import { describe, expect, test } from "bun:test";
import { serializeDownloadedImage, serializeFailedDownload, serializeImageResult } from "./serialization.js";
import type { DownloadedImage, FailedDownload, ImageResult } from "./types.js";

describe("agent-facing serialization", () => {
  test("returns only compact search result fields plus title and description", () => {
    const result: ImageResult = {
      id: "1",
      provider: "pexels",
      title: "Sunset",
      description: "A bright sunset over the ocean",
      tags: ["sunset", "ocean"],
      width: 1600,
      height: 900,
      url: "https://example.com/full.jpg",
      downloadUrl: "https://example.com/full.jpg",
      previewUrl: "https://example.com/preview.jpg",
      thumbnailUrl: "https://example.com/thumb.jpg",
      sourcePage: "https://example.com/source",
      author: "Photographer",
      authorUrl: "https://example.com/author",
      licenseName: "Pexels License",
      raw: { noisy: true },
    };

    expect(serializeImageResult(result)).toEqual({
      provider: "pexels",
      title: "Sunset",
      description: "A bright sunset over the ocean",
      downloadUrl: "https://example.com/full.jpg",
      width: 1600,
      height: 900,
      sourcePage: "https://example.com/source",
    });
  });

  test("returns compact downloaded and failed records", () => {
    const downloaded: DownloadedImage = {
      filePath: "/tmp/sunset.jpg",
      provider: "pexels",
      width: 1600,
      height: 900,
      author: "Photographer",
      sourcePage: "https://example.com/source",
      downloadUrl: "https://example.com/full.jpg",
      licenseName: "Pexels License",
    };
    const failed: FailedDownload = {
      provider: "bing",
      sourcePage: "https://example.com/source",
      downloadUrl: "https://example.com/broken.jpg",
      error: "HTTP 403",
    };

    expect(serializeDownloadedImage(downloaded)).toEqual({
      filePath: "/tmp/sunset.jpg",
      provider: "pexels",
      width: 1600,
      height: 900,
    });
    expect(serializeFailedDownload(failed)).toEqual({
      provider: "bing",
      downloadUrl: "https://example.com/broken.jpg",
      error: "HTTP 403",
    });
  });
});
