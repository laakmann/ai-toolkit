import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { promisify } from 'util';
import { getDatasetsRoot } from '@/server/settings';
import { collectDatasetStats } from '@/server/datasetStats';

const brotliCompress = promisify(zlib.brotliCompress);
const gzipCompress = promisify(zlib.gzip);

export async function POST(request: Request) {
  const datasetsPath = await getDatasetsRoot();
  const body = await request.json();
  const { datasetName } = body;
  if (typeof datasetName !== 'string' || datasetName.trim() === '') {
    return NextResponse.json({ error: 'Invalid dataset name' }, { status: 400 });
  }
  const datasetFolder = path.resolve(datasetsPath, datasetName);
  // Must resolve to a direct child of the datasets root; rejects "..", absolute paths, and the root itself.
  if (path.dirname(datasetFolder) !== datasetsPath || datasetFolder === datasetsPath) {
    return NextResponse.json({ error: 'Invalid dataset name' }, { status: 400 });
  }

  try {
    // Check if folder exists
    try {
      await fs.promises.access(datasetFolder);
    } catch {
      return NextResponse.json({ error: `Folder '${datasetName}' not found` }, { status: 404 });
    }

    // Find all media recursively and collect counts/sizes in the same walk.
    const { mediaPaths, ...stats } = await collectDatasetStats(datasetFolder, {
      includeSizes: true,
      collectMediaPaths: true,
    });
    const imageFiles = mediaPaths ?? [];

    // Sort server-side so the client doesn't have to sort large lists
    imageFiles.sort((a, b) => a.localeCompare(b));

    // Send a single shared root plus each file's sub-path, rather than repeating the full
    // absolute path (and an "img_path" key) on every entry. The root carries the trailing
    // OS separator so the client rebuilds the native path with a plain concat (root + subPath),
    // keeping correct paths on Windows, macOS, and Linux without any separator logic client-side.
    const root = datasetFolder + path.sep;
    const result = imageFiles.map(imgPath => imgPath.slice(root.length));

    // Compress the payload explicitly. Even after stripping the shared prefix these lists
    // still gzip/brotli down substantially — a big win on slow connections and huge datasets.
    // The browser decompresses transparently via Content-Encoding, so the client just parses JSON.
    const json = JSON.stringify({ root, images: result, stats });
    const acceptEncoding = request.headers.get('accept-encoding') ?? '';

    if (/\bbr\b/.test(acceptEncoding)) {
      const body = await brotliCompress(json);
      return new NextResponse(body as any, {
        headers: { 'Content-Type': 'application/json', 'Content-Encoding': 'br' },
      });
    }
    if (/\bgzip\b/.test(acceptEncoding)) {
      const body = await gzipCompress(json);
      return new NextResponse(body as any, {
        headers: { 'Content-Type': 'application/json', 'Content-Encoding': 'gzip' },
      });
    }

    return new NextResponse(json, { headers: { 'Content-Type': 'application/json' } });
  } catch (error) {
    console.error('Error finding images:', error);
    return NextResponse.json({ error: 'Failed to process request' }, { status: 500 });
  }
}
