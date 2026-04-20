import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  type DownloadResult,
  type ImageInfo,
  type SearchResult,
  MIN_IMAGE_SIZE,
  DEFAULT_IMAGE_COUNT,
  REQUEST_TIMEOUT,
} from "./types.js";

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const HEADERS = { "User-Agent": USER_AGENT };

export function parseImageDimensions(buffer: ArrayBuffer): { width: number; height: number } {
  const view = new DataView(buffer);

  // JPEG: SOF0 marker at different offsets
  if (view.getUint16(0) === 0xffd8) {
    let offset = 2;
    while (offset < view.byteLength - 1) {
      const marker = view.getUint16(offset);
      // SOF0 (0xFFC0) through SOF15 (0xFFCF), excluding DHT/DQT
      if (
        (marker >= 0xffc0 && marker <= 0xffcf) &&
        marker !== 0xffc4 && marker !== 0xffc8 &&
        marker !== 0xffcc
      ) {
        return {
          height: view.getUint16(offset + 5),
          width: view.getUint16(offset + 7),
        };
      }
      offset += 2 + view.getUint16(offset + 2);
    }
  }

  // PNG
  if (
    view.getUint32(0) === 0x89504e47 &&
    view.getUint32(4) === 0x0d0a1a0a
  ) {
    return {
      width: view.getUint32(16),
      height: view.getUint32(20),
    };
  }

  // GIF
  const magic = String.fromCharCode(...new Uint8Array(buffer, 0, 6));
  if (magic === "GIF87a" || magic === "GIF89a") {
    return {
      width: view.getUint16(6, true),
      height: view.getUint16(8, true),
    };
  }

  // WebP: RIFF....WEBP
  if (
    view.getUint32(0) === 0x52494646 &&
    view.getUint32(8) === 0x57454250
  ) {
    const chunk = view.getUint32(12);
    if (chunk === 0x56503820) {
      // VP8 lossy
      return {
        width: view.getUint16(26, true) & 0x3fff,
        height: view.getUint16(28, true) & 0x3fff,
      };
    }
    if (chunk === 0x5650384c) {
      // VP8L lossless
      const bits = view.getUint32(21, true);
      return {
        width: (bits & 0x3fff) + 1,
        height: ((bits >> 14) & 0x3fff) + 1,
      };
    }
  }

  return { width: 0, height: 0 };
}

async function downloadImage(url: string): Promise<ImageInfo | null> {
  try {
    const response = await fetch(url, {
      headers: HEADERS,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT),
    });
    if (!response.ok) return null;

    const buffer = await response.arrayBuffer();
    if (buffer.byteLength < 1024) return null; // skip tiny files

    const { width, height } = parseImageDimensions(buffer);
    return {
      url,
      thumbnailUrl: "",
      width,
      height,
      sourcePage: "",
      buffer,
      resolution: width * height,
    };
  } catch {
    return null;
  }
}

function getExtension(url: string): string {
  const match = url.match(/\.(jpe?g|png|gif|webp|bmp)/i);
  return match ? match[1].toLowerCase() : "jpg";
}

export async function downloadImages(
  searchResults: SearchResult[],
  keyword: string,
  count = DEFAULT_IMAGE_COUNT,
  saveDir = "images"
): Promise<DownloadResult[]> {
  const dir = join(saveDir, keyword.replace(/[^a-zA-Z0-9\u4e00-\u9fff]/g, "_"));
  await mkdir(dir, { recursive: true });

  const candidates = await Promise.all(searchResults.map((r) => downloadImage(r.url)));

  const valid = candidates
    .filter((img): img is ImageInfo =>
      img !== null &&
      img.width >= MIN_IMAGE_SIZE &&
      img.height >= MIN_IMAGE_SIZE
    )
    .sort((a, b) => b.resolution - a.resolution)
    .slice(0, count);

  const results: DownloadResult[] = [];
  for (let i = 0; i < valid.length; i++) {
    const img = valid[i];
    const ext = getExtension(img.url);
    const filename = `${keyword.replace(/[^a-zA-Z0-9\u4e00-\u9fff]/g, "_")}_${i + 1}.${ext}`;
    const filePath = join(dir, filename);

    try {
      await writeFile(filePath, Buffer.from(img.buffer));
      results.push({ filePath, success: true, width: img.width, height: img.height });
    } catch (err) {
      results.push({ filePath, success: false, error: String(err) });
    }
  }

  return results;
}
