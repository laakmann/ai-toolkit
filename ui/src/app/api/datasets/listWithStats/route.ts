import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { getDatasetsRoot } from '@/server/settings';
import { getDatasetStats } from '@/server/datasetStats';

export async function GET(request: NextRequest) {
  try {
    const datasetsPath = await getDatasetsRoot();

    try {
      await fs.promises.access(datasetsPath);
    } catch {
      await fs.promises.mkdir(datasetsPath);
    }

    const url = new URL(request.url);
    const includeSizes = url.searchParams.get('sizes') === '1';
    const refresh = url.searchParams.get('refresh') === '1';

    const folders = (await fs.promises.readdir(datasetsPath, { withFileTypes: true }))
      .filter(dirent => dirent.isDirectory())
      .filter(dirent => !dirent.name.startsWith('.'))
      .map(dirent => dirent.name)
      .sort((a, b) => a.localeCompare(b));

    const results = await Promise.all(
      folders.map(async folderName => {
        const folderPath = path.join(datasetsPath, folderName);
        const stats = await getDatasetStats(folderPath, { includeSizes, refresh });
        return {
          name: folderName,
          ...stats,
        };
      }),
    );

    return NextResponse.json(results);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch dataset stats' }, { status: 500 });
  }
}
