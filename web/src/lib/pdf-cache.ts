/**
 * PDFキャッシュ（インメモリ）
 * set-pricing時に3つのPDFを事前生成してキャッシュ
 */

const cache = new Map<string, Buffer>();

export function setPdfCache(key: string, data: Buffer) {
  cache.set(key, data);
}

export function getPdfCache(key: string): Buffer | undefined {
  return cache.get(key);
}

export function cacheKey(token: string, sheetIdx: number): string {
  return `${token}:${sheetIdx}`;
}
