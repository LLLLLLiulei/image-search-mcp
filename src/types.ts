export interface SearchResult {
  url: string;
  thumbnailUrl: string;
  width: number;
  height: number;
  sourcePage: string;
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
export const MAX_RETRIES = 3;
export const REQUEST_TIMEOUT = 10000;
