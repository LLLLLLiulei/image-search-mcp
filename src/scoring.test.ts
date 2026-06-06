import { describe, expect, test } from "bun:test";
import { filterByOrientation, rankResults } from "./scoring.js";
import type { ImageResult } from "./types.js";

function candidate(overrides: Partial<ImageResult>): ImageResult {
  return {
    provider: "bing",
    width: 1200,
    height: 800,
    downloadUrl: "https://example.com/image.jpg",
    sourcePage: "https://example.com/page",
    author: "",
    ...overrides,
  } as ImageResult;
}

describe("result scoring", () => {
  test("uses unified metadata fields for relevance before provider priority and resolution", () => {
    const irrelevantPexels = candidate({
      provider: "pexels",
      width: 6000,
      height: 4000,
      description: "Portrait of a business person",
      downloadUrl: "https://example.com/person.jpg",
      sourcePage: "https://example.com/person",
    });
    const relevantPixabay = candidate({
      provider: "pixabay",
      width: 1600,
      height: 1000,
      tags: ["mountain", "lake", "sunrise"],
      downloadUrl: "https://example.com/mountain.jpg",
      sourcePage: "https://example.com/mountain",
    });

    const ranked = rankResults([irrelevantPexels, relevantPixabay], "mountain lake", 1);

    expect(ranked[0].downloadUrl).toBe("https://example.com/mountain.jpg");
  });

  test("drops candidates with no query token match when query has ASCII keywords", () => {
    const unrelated = candidate({
      provider: "bing",
      width: 1600,
      height: 900,
      title: "unrelated game guide",
      description: "online game entrance",
      sourcePage: "https://example.com/game",
      downloadUrl: "https://example.com/game.jpg",
    });

    expect(rankResults([unrelated], "mountain lake sunrise", 5)).toEqual([]);
  });

  test("filters by requested orientation when matching candidates exist", () => {
    const portrait = candidate({
      width: 900,
      height: 1400,
      description: "mountain portrait",
      downloadUrl: "https://example.com/portrait.jpg",
    });
    const landscape = candidate({
      width: 1600,
      height: 900,
      description: "mountain landscape",
      downloadUrl: "https://example.com/landscape.jpg",
    });

    const filtered = filterByOrientation([portrait, landscape], "landscape");

    expect(filtered.map((item) => item.downloadUrl)).toEqual(["https://example.com/landscape.jpg"]);
  });

  test("keeps original candidates when orientation filtering would remove all results", () => {
    const portrait = candidate({
      width: 900,
      height: 1400,
      description: "mountain portrait",
      downloadUrl: "https://example.com/portrait.jpg",
    });

    expect(filterByOrientation([portrait], "landscape")).toEqual([portrait]);
  });
});
