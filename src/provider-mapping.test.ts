import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { searchPhotos as searchPexels } from "./pexels-api.js";
import { searchPhotos as searchPixabay } from "./pixabay-api.js";

const originalFetch = globalThis.fetch;
const originalEnv = { ...process.env };

function restoreEnv() {
  for (const key of Object.keys(process.env)) {
    if (!(key in originalEnv)) delete process.env[key];
  }
  Object.assign(process.env, originalEnv);
}

describe("provider API mapping", () => {
  beforeEach(() => {
    restoreEnv();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    restoreEnv();
  });

  test("maps squarish to Pexels square and preserves Pexels metadata", async () => {
    process.env.PEXELS_API_KEY = "pexels-test-key";
    let requestedUrl = "";

    globalThis.fetch = (async (input: RequestInfo | URL) => {
      requestedUrl = String(input);
      return new Response(JSON.stringify({
        photos: [{
          id: 42,
          width: 4000,
          height: 4000,
          url: "https://www.pexels.com/photo/square-mountain-42/",
          photographer: "Ada Lens",
          photographer_url: "https://www.pexels.com/@ada-lens/",
          avg_color: "#334455",
          alt: "Square mountain lake at sunrise",
          src: {
            original: "https://images.pexels.com/photos/42/original.jpg",
            large2x: "https://images.pexels.com/photos/42/large2x.jpg",
            large: "https://images.pexels.com/photos/42/large.jpg",
            medium: "https://images.pexels.com/photos/42/medium.jpg",
            small: "https://images.pexels.com/photos/42/small.jpg",
            tiny: "https://images.pexels.com/photos/42/tiny.jpg",
          },
        }],
      }));
    }) as typeof fetch;

    const results = await searchPexels("mountain lake", 1, "squarish");
    const params = new URL(requestedUrl).searchParams;

    expect(params.get("orientation")).toBe("square");
    expect(results[0]).toMatchObject({
      id: "42",
      provider: "pexels",
      description: "Square mountain lake at sunrise",
      downloadUrl: "https://images.pexels.com/photos/42/original.jpg",
      previewUrl: "https://images.pexels.com/photos/42/large2x.jpg",
      thumbnailUrl: "https://images.pexels.com/photos/42/medium.jpg",
      author: "Ada Lens",
      authorUrl: "https://www.pexels.com/@ada-lens/",
      dominantColor: "#334455",
      licenseName: "Pexels License",
      licenseUrl: "https://www.pexels.com/license/",
    });
  });

  test("clamps Pixabay per_page, omits unsupported squarish orientation, and preserves tags", async () => {
    process.env.PIXABAY_API_KEY = "pixabay-test-key";
    let requestedUrl = "";
    const longQuery = "mountain ".repeat(20);

    globalThis.fetch = (async (input: RequestInfo | URL) => {
      requestedUrl = String(input);
      return new Response(JSON.stringify({
        hits: [{
          id: 77,
          pageURL: "https://pixabay.com/photos/mountain-lake-77/",
          largeImageURL: "https://cdn.pixabay.com/photo/77_1280.jpg",
          webformatURL: "https://cdn.pixabay.com/photo/77_640.jpg",
          previewURL: "https://cdn.pixabay.com/photo/77_150.jpg",
          imageWidth: 3000,
          imageHeight: 2000,
          user: "Pixel Maker",
          user_id: 987,
          userImageURL: "https://pixabay.com/users/987.jpg",
          tags: "mountain, lake, sunrise",
        }],
      }));
    }) as typeof fetch;

    const results = await searchPixabay(longQuery, 1, "squarish");
    const params = new URL(requestedUrl).searchParams;

    expect(params.get("per_page")).toBe("3");
    expect(params.get("orientation")).toBeNull();
    expect((params.get("q") || "").length).toBeLessThanOrEqual(100);
    expect(results[0]).toMatchObject({
      id: "77",
      provider: "pixabay",
      description: "mountain, lake, sunrise",
      tags: ["mountain", "lake", "sunrise"],
      downloadUrl: "https://cdn.pixabay.com/photo/77_1280.jpg",
      previewUrl: "https://cdn.pixabay.com/photo/77_640.jpg",
      thumbnailUrl: "https://cdn.pixabay.com/photo/77_150.jpg",
      author: "Pixel Maker",
      authorId: "987",
      authorAvatarUrl: "https://pixabay.com/users/987.jpg",
      licenseName: "Pixabay Content License",
      licenseUrl: "https://pixabay.com/service/license-summary/",
    });
  });
});
