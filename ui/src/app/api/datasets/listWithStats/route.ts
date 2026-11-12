import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { getDatasetsRoot } from '@/server/settings';

type DatasetStats = {
  name: string;
  image_count: number;
  video_count: number;
  audio_count: number;
  caption_counts: {
    txt: number;
    json: number;
    caption: number;
  };
};

const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp']);
const VIDEO_EXTENSIONS = new Set(['.mp4', '.avi', '.mov', '.mkv', '.wmv', '.m4v', '.flv']);
const AUDIO_EXTENSIONS = new Set(['.mp3', '.wav', '.flac', '.ogg']);

export async function GET() {
  try {
    const datasetsPath = await getDatasetsRoot();

    try {
      await fs.promises.access(datasetsPath);
    } catch {
      await fs.promises.mkdir(datasetsPath);
    }

    const folders = (await fs.promises.readdir(datasetsPath, { withFileTypes: true }))
      .filter(dirent => dirent.isDirectory())
      .filter(dirent => !dirent.name.startsWith('.'))
      .map(dirent => dirent.name)
      .sort((a, b) => a.localeCompare(b));

    const results = await Promise.all(
      folders.map(async folderName => {
        const folderPath = path.join(datasetsPath, folderName);
        const stats = await collectDatasetStats(folderPath);
        return {
          name: folderName,
          ...stats,
        } as DatasetStats;
      }),
    );

    return NextResponse.json(results);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch dataset stats' }, { status: 500 });
  }
}

async function collectDatasetStats(rootDir: string): Promise<Omit<DatasetStats, 'name'>> {
  const totals = {
    image_count: 0,
    video_count: 0,
    audio_count: 0,
    caption_counts: {
      txt: 0,
      json: 0,
      caption: 0,
    },
  };

  async function walk(dir: string): Promise<void> {
    const entries = await fs.promises.readdir(dir, { withFileTypes: true });
    const fileNamesLower = new Set(entries.filter(entry => entry.isFile()).map(entry => entry.name.toLowerCase()));

    for (const entry of entries) {
      const name = entry.name;
      if (name.startsWith('.')) continue;

      const fullPath = path.join(dir, name);
      if (entry.isDirectory()) {
        if (name === '_controls') continue;
        await walk(fullPath);
        continue;
      }
      if (!entry.isFile()) continue;

      const ext = path.extname(name).toLowerCase();
      if (IMAGE_EXTENSIONS.has(ext)) {
        totals.image_count += 1;
        const stem = path.parse(name).name.toLowerCase();
        if (fileNamesLower.has(`${stem}.txt`)) totals.caption_counts.txt += 1;
        if (fileNamesLower.has(`${stem}.json`)) totals.caption_counts.json += 1;
        if (fileNamesLower.has(`${stem}.caption`)) totals.caption_counts.caption += 1;
      } else if (VIDEO_EXTENSIONS.has(ext)) {
        totals.video_count += 1;
      } else if (AUDIO_EXTENSIONS.has(ext)) {
        totals.audio_count += 1;
      }
    }
  }

  await walk(rootDir);
  return totals;
}
