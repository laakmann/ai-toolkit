import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { collectDatasetStats, getDatasetStats } from '../ui/src/server/datasetStats.ts';
import { formatBytes } from '../ui/src/utils/basic.ts';

async function writeFile(filePath: string, bytes: number) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, Buffer.alloc(bytes, 1));
}

async function makeDataset() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'aitk-dataset-stats-'));

  await writeFile(path.join(root, 'a.png'), 10);
  await writeFile(path.join(root, 'a.txt'), 4);
  await writeFile(path.join(root, 'b.jpg'), 20);
  await writeFile(path.join(root, 'sub', 'c.webp'), 30);
  await writeFile(path.join(root, 'sub', 'c.json'), 6);
  await writeFile(path.join(root, 'sub', 'd.png'), 40);
  await writeFile(path.join(root, '_controls', 'ignore.png'), 5);
  await writeFile(path.join(root, '.hidden.png'), 5);
  await writeFile(path.join(root, 'notes.md'), 7);
  await writeFile(path.join(root, 'video.mp4'), 50);
  await writeFile(path.join(root, 'audio.mp3'), 60);
  await writeFile(path.join(root, 'e.jpg'), 15);
  await writeFile(path.join(root, 'e.caption'), 8);

  return root;
}

test('collects media counts, caption coverage, and byte totals', async () => {
  const root = await makeDataset();
  try {
    const stats = await collectDatasetStats(root, { includeSizes: true, collectMediaPaths: true });

    assert.equal(stats.image_count, 5);
    assert.equal(stats.video_count, 1);
    assert.equal(stats.audio_count, 1);
    assert.deepEqual(stats.caption_counts, { txt: 1, json: 1, caption: 1 });
    assert.equal(stats.file_count, 11);
    assert.equal(stats.media_size_bytes, 225);
    assert.equal(stats.caption_size_bytes, 18);
    assert.equal(stats.total_size_bytes, 250);
    assert.equal(stats.mediaPaths?.length, 7);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('count-only scans skip stat calls and leave sizes at zero', async () => {
  const root = await makeDataset();
  try {
    const stats = await collectDatasetStats(root, { includeSizes: false });

    assert.equal(stats.image_count, 5);
    assert.equal(stats.file_count, 11);
    assert.equal(stats.media_size_bytes, 0);
    assert.equal(stats.caption_size_bytes, 0);
    assert.equal(stats.total_size_bytes, 0);
    assert.equal(stats.mediaPaths, undefined);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('cached stats can be bypassed with refresh', async () => {
  const root = await makeDataset();
  try {
    const first = await getDatasetStats(root, { includeSizes: true });
    assert.equal(first.total_size_bytes, 250);

    await writeFile(path.join(root, 'notes.md'), 17);

    const cached = await getDatasetStats(root, { includeSizes: true });
    assert.equal(cached.total_size_bytes, 250);

    const refreshed = await getDatasetStats(root, { includeSizes: true, refresh: true });
    assert.equal(refreshed.total_size_bytes, 260);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('formatBytes uses compact binary units', () => {
  assert.equal(formatBytes(0), '0 B');
  assert.equal(formatBytes(512), '512 B');
  assert.equal(formatBytes(1536), '1.50 KB');
  assert.equal(formatBytes(1024 * 1024 * 18.4), '18.4 MB');
  assert.equal(formatBytes(1024 * 1024 * 1024 * 2.4), '2.40 GB');
});
