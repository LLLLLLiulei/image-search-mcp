import type { DownloadedImage, FailedDownload, ImageResult } from "./types.js";

export interface SerializedImageResult {
  provider: ImageResult["provider"];
  title?: string;
  description?: string;
  downloadUrl: string;
  width: number;
  height: number;
  sourcePage: string;
}

export interface SerializedDownloadedImage {
  filePath: string;
  provider: DownloadedImage["provider"];
  width: number;
  height: number;
}

export interface SerializedFailedDownload {
  provider: FailedDownload["provider"];
  downloadUrl: string;
  error: string;
}

export function serializeImageResult(img: ImageResult): SerializedImageResult {
  return {
    provider: img.provider,
    title: img.title || undefined,
    description: img.description || undefined,
    downloadUrl: img.downloadUrl,
    width: img.width,
    height: img.height,
    sourcePage: img.sourcePage,
  };
}

export function serializeDownloadedImage(img: DownloadedImage): SerializedDownloadedImage {
  return {
    filePath: img.filePath,
    provider: img.provider,
    width: img.width,
    height: img.height,
  };
}

export function serializeFailedDownload(download: FailedDownload): SerializedFailedDownload {
  return {
    provider: download.provider,
    downloadUrl: download.downloadUrl,
    error: download.error,
  };
}
