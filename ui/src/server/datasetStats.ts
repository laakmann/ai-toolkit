import fs from 'fs';
import type { Dirent } from 'fs';
import path from 'path';

export type DatasetStats = {
  name?: string;
  image_count: number;
  video_count: number;
  audio_count: number;
  caption_counts: {
    txt: number;
    json: number;
    caption: number;
  };
  file_count: number;
  media_size_bytes: number;
  caption_size_bytes: number;
  total_size_bytes: number;
};

export type DatasetStatsCollection = DatasetStats & {
  /** Full paths of image/video/audio files, only when requested. */
  mediaPaths?: string[];
};

export interface CollectDatasetStatsOptions {
  /** Stat every file to populate byte totals. */
  includeSizes?: boolean;
  /** Collect full media file paths while walking (used by listImages). */
  collectMediaPaths?: boolean;
}

export const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp']);
export const VIDEO_EXTENSIONS = new Set(['.mp4', '.avi', '.mov', '.mkv', '.wmv', '.m4v', '.flv']);
export const AUDIO_EXTENSIONS = new Set(['.mp3', '.wav', '.flac', '.ogg']);
const CAPTION_EXTENSIONS = new Set(['.txt', '.json', '.caption']);

const STATS_CACHE_TTL_MS = 60_000;
const statLimit = createLimiter(16);

type CacheEntry = { stats: DatasetStats; expiresAt: number };
const statsCache = new Map<string, CacheEntry>();

function createLimiter(limit: number) {
  let active = 0;
  const waiting: (() => void)[] = [];

  return <T>(fn: () => Promise<T>): Promise<T> =>
    new Promise<T>((resolve, reject) => {
      const run = () => {
        active += 1;
        Promise.resolve()
          .then(fn)
          .then(resolve, reject)
          .finally(() => {
            active -= 1;
            waiting.shift()?.();
          });
      };

      if (active < limit) run();
      else waiting.push(run);
    });
}

function emptyStats(): DatasetStatsCollection {
  return {
    image_count: 0,
    video_count: 0,
    audio_count: 0,
    caption_counts: { txt: 0, json: 0, caption: 0 },
    file_count: 0,
    media_size_bytes: 0,
    caption_size_bytes: 0,
    total_size_bytes: 0,
  };
}

/**
 * Walk one dataset recursively and collect media/caption counts and byte totals.
 * Hidden entries and `_controls` are skipped, matching the dataset loader.
 */
export async function collectDatasetStats(
  rootDir: string,
  options: CollectDatasetStatsOptions = {},
): Promise<DatasetStatsCollection> {
  const includeSizes = options.includeSizes === true;
  const collectMediaPaths = options.collectMediaPaths === true;
  const totals = emptyStats();
  const mediaPaths: string[] = [];

  async function walk(dir: string): Promise<void> {
    let entries: Dirent[];
    try {
      entries = await fs.promises.readdir(dir, { withFileTypes: true });
    } catch {
      // An unreadable/missing subdirectory should not hide every other dataset.
      return;
    }

    const fileNamesLower = new Set(
      entries.filter(entry => entry.isFile()).map(entry => entry.name.toLowerCase()),
    );
    const subdirs: string[] = [];
    const files: { name: string; fullPath: string; ext: string }[] = [];

    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        if (entry.name === '_controls') continue;
        subdirs.push(fullPath);
        continue;
      }
      if (!entry.isFile()) continue;

      files.push({
        name: entry.name,
        fullPath,
        ext: path.extname(entry.name).toLowerCase(),
      });
    }

    const processFile = async (file: { name: string; fullPath: string; ext: string }) => {
      const isImage = IMAGE_EXTENSIONS.has(file.ext);
      const isVideo = VIDEO_EXTENSIONS.has(file.ext);
      const isAudio = AUDIO_EXTENSIONS.has(file.ext);
      const isCaption = CAPTION_EXTENSIONS.has(file.ext);

      let size = 0;
      if (includeSizes) {
        try {
          const stat = await statLimit(() => fs.promises.stat(file.fullPath));
          size = stat.size;
        } catch {
          // File was removed between readdir and stat.
          return;
        }
      }

      totals.file_count += 1;
      totals.total_size_bytes += size;

      if (isImage) {
        totals.image_count += 1;
        totals.media_size_bytes += size;
        if (collectMediaPaths) mediaPaths.push(file.fullPath);
        const stem = path.parse(file.name).name.toLowerCase();
        if (fileNamesLower.has(`${stem}.txt`)) totals.caption_counts.txt += 1;
        if (fileNamesLower.has(`${stem}.json`)) totals.caption_counts.json += 1;
        if (fileNamesLower.has(`${stem}.caption`)) totals.caption_counts.caption += 1;
      } else if (isVideo) {
        totals.video_count += 1;
        totals.media_size_bytes += size;
        if (collectMediaPaths) mediaPaths.push(file.fullPath);
      } else if (isAudio) {
        totals.audio_count += 1;
        totals.media_size_bytes += size;
        if (collectMediaPaths) mediaPaths.push(file.fullPath);
      } else if (isCaption) {
        totals.caption_size_bytes += size;
      }
    };

    // Keep a bounded number of file stats in flight. A flat folder with tens of
    // thousands of images would otherwise stat one file at a time.
    const FILE_CHUNK = 32;
    for (let i = 0; i < files.length; i += FILE_CHUNK) {
      await Promise.all(files.slice(i, i + FILE_CHUNK).map(processFile));
    }

    await Promise.all(subdirs.map(subdir => walk(subdir)));
  }

  await walk(rootDir);
  return collectMediaPaths ? { ...totals, mediaPaths } : totals;
}

/**
 * Cached variant used by the bulk list endpoint. The size and count variants
 * are cached independently so the New Job form keeps its count-only fast path.
 */
export async function getDatasetStats(
  rootDir: string,
  options: { includeSizes?: boolean; refresh?: boolean } = {},
): Promise<DatasetStats> {
  const includeSizes = options.includeSizes === true;
  const cacheKey = `${includeSizes ? 'sizes' : 'counts'}:${rootDir}`;
  const now = Date.now();

  if (!options.refresh) {
    const hit = statsCache.get(cacheKey);
    if (hit && hit.expiresAt > now) return hit.stats;
  }

  const stats = await collectDatasetStats(rootDir, { includeSizes });
  statsCache.set(cacheKey, { stats, expiresAt: Date.now() + STATS_CACHE_TTL_MS });
  return stats;
}

/** Drop cached stats for one dataset path, or the whole cache. */
export function invalidateDatasetStatsCache(rootDir?: string): void {
  if (!rootDir) {
    statsCache.clear();
    return;
  }
  const suffix = `${path.normalize(rootDir)}`;
  for (const key of Array.from(statsCache.keys())) {
    if (key.endsWith(`:${suffix}`)) statsCache.delete(key);
  }
}
