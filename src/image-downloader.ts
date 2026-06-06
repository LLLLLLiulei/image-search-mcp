import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  type DownloadImagesResult,
  type DownloadedImage,
  type FailedDownload,
  type ImageProvider,
  type ImageResult,
  MIN_IMAGE_SIZE,
  DEFAULT_IMAGE_COUNT,
  REQUEST_TIMEOUT,
} from "./types.js";

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const HEADERS = { "User-Agent": USER_AGENT };

export function parseImageDimensions(buffer: ArrayBuffer): { width: number; height: number } {
  if (buffer.byteLength < 10) return { width: 0, height: 0 };
  const view = new DataView(buffer);

  // JPEG: SOF0 marker at different offsets
  if (view.getUint16(0) === 0xffd8) {
    let offset = 2;
    while (offset + 4 < view.byteLength) {
      const marker = view.getUint16(offset);
      // SOF0 (0xFFC0) through SOF15 (0xFFCF), excluding DHT/DQT
      if (
        (marker >= 0xffc0 && marker <= 0xffcf) &&
        marker !== 0xffc4 && marker !== 0xffc8 &&
        marker !== 0xffcc
      ) {
        if (offset + 9 > view.byteLength) return { width: 0, height: 0 };
        return {
          height: view.getUint16(offset + 5),
          width: view.getUint16(offset + 7),
        };
      }
      const segmentLength = view.getUint16(offset + 2);
      if (segmentLength <= 0) break;
      offset += 2 + segmentLength;
    }
  }

  // PNG
  if (buffer.byteLength >= 24) {
    if (
      view.getUint32(0) === 0x89504e47 &&
      view.getUint32(4) === 0x0d0a1a0a
    ) {
      return {
        width: view.getUint32(16),
        height: view.getUint32(20),
      };
    }
  }

  // GIF
  if (buffer.byteLength >= 10) {
    const magic = String.fromCharCode(...new Uint8Array(buffer, 0, 6));
    if (magic === "GIF87a" || magic === "GIF89a") {
      return {
        width: view.getUint16(6, true),
        height: view.getUint16(8, true),
      };
    }
  }

  // WebP: RIFF....WEBP
  if (buffer.byteLength >= 30) {
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
  }

  return { width: 0, height: 0 };
}

function getExtension(url: string): string {
  const match = url.match(/\.(jpe?g|png|gif|webp|bmp)/i);
  return match ? match[1].toLowerCase() : "jpg";
}

function sanitizeName(value: string): string {
  const safe = value.replace(/[^a-zA-Z0-9\u4e00-\u9fff]/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "");
  return safe.slice(0, 80) || "image_search";
}

function toImageResult(input: ImageResult): ImageResult {
  const downloadUrl = input.downloadUrl || input.url;
  return {
    ...input,
    downloadUrl,
    url: input.url || downloadUrl,
    provider: input.provider || ("bing" as ImageProvider),
  };
}

function isProbablyImage(response: Response): boolean {
  const contentType = response.headers.get("content-type") || "";
  return !contentType || contentType.toLowerCase().startsWith("image/");
}

async function fetchImageBuffer(url: string): Promise<ArrayBuffer> {
  const response = await fetch(url, {
    headers: HEADERS,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  if (!isProbablyImage(response)) throw new Error(`Unexpected content type: ${response.headers.get("content-type")}`);
  const buffer = await response.arrayBuffer();
  if (buffer.byteLength < 1024) throw new Error("File too small");
  return buffer;
}

export async function downloadImages(
  searchResults: ImageResult[],
  keyword: string,
  count = DEFAULT_IMAGE_COUNT,
  saveDir = "images"
): Promise<DownloadImagesResult> {
  const safeKeyword = sanitizeName(keyword);
  const dir = join(saveDir, safeKeyword);
  await mkdir(dir, { recursive: true });

  const downloaded: DownloadedImage[] = [];
  const failed: FailedDownload[] = [];
  const targetCount = Math.max(1, Math.trunc(count));

  for (const raw of searchResults) {
    if (downloaded.length >= targetCount) break;
    const img = toImageResult(raw);
    const ext = getExtension(img.downloadUrl);
    const filename = `${safeKeyword}_${img.provider}_${downloaded.length + 1}.${ext}`;
    const filePath = join(dir, filename);

    try {
      const buffer = await fetchImageBuffer(img.downloadUrl);
      const parsed = parseImageDimensions(buffer);
      const width = parsed.width || img.width || 0;
      const height = parsed.height || img.height || 0;
      if (width > 0 && width < MIN_IMAGE_SIZE) throw new Error(`Image width too small: ${width}`);
      if (height > 0 && height < MIN_IMAGE_SIZE) throw new Error(`Image height too small: ${height}`);
      await writeFile(filePath, Buffer.from(buffer));
      downloaded.push({
        filePath,
        width,
        height,
        provider: img.provider,
        author: img.author,
        sourcePage: img.sourcePage,
        downloadUrl: img.downloadUrl,
        licenseName: img.licenseName,
        licenseUrl: img.licenseUrl,
        attributionText: img.attributionText,
      });
    } catch (err) {
      failed.push({
        downloadUrl: img.downloadUrl,
        provider: img.provider,
        sourcePage: img.sourcePage,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return { directory: dir, downloaded, failed };
}
