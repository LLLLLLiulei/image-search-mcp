export interface SearchResult {
  url: string;
  thumbnailUrl: string;
  width: number;
  height: number;
  sourcePage: string;
  title?: string;
}

export interface DownloadResult {
  filePath: string;
  success: boolean;
  width: number;
  height: number;
  error?: string;
}

export interface ImageInfo extends SearchResult {
  buffer: ArrayBuffer;
  resolution: number;
}

export const MIN_IMAGE_SIZE = 200;
export const DEFAULT_IMAGE_COUNT = 5;

export type ImageProvider = "pexels" | "pixabay" | "unsplash" | "bing";

export interface ImageResult {
  id?: string;
  provider: ImageProvider;
  title?: string;
  description?: string;
  tags?: string[];
  width: number;
  height: number;
  downloadUrl: string;
  url: string;
  previewUrl?: string;
  thumbnailUrl?: string;
  sourcePage: string;
  author?: string;
  authorUrl?: string;
  authorId?: string;
  authorAvatarUrl?: string;
  licenseName?: string;
  licenseUrl?: string;
  attributionRequired?: boolean;
  attributionText?: string;
  dominantColor?: string;
  temporaryUrl?: boolean;
  downloadTrackingUrl?: string;
  raw?: unknown;
}

export interface DownloadedImage {
  filePath: string;
  width: number;
  height: number;
  provider: ImageProvider;
  author?: string;
  sourcePage: string;
  downloadUrl: string;
  licenseName?: string;
  licenseUrl?: string;
  attributionText?: string;
}

export interface FailedDownload {
  downloadUrl: string;
  provider: ImageProvider;
  sourcePage: string;
  error: string;
}

export interface DownloadImagesResult {
  directory: string;
  downloaded: DownloadedImage[];
  failed: FailedDownload[];
}

export type ProviderStatus = "ok" | "skipped" | "error";

export interface ProviderDiagnostic {
  status: ProviderStatus;
  count: number;
  error?: string;
}

export type ProviderDiagnostics = Record<ImageProvider, ProviderDiagnostic>;

export const MAX_RETRIES = 3;
export const REQUEST_TIMEOUT = 10000;
