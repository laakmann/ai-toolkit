import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_MA_WINDOW,
  MA_WINDOW_MAX,
  MA_WINDOW_MIN,
  clampMaWindow,
  formatLossKeyLabel,
  formatLossSeriesLabel,
  maWindowToSlider,
  parseLossKey,
  seriesColor,
  seriesIdentityKey,
  sliderToMaWindow,
  trailingMovingStatsWithNulls,
  trendDash,
  withAlpha,
} from '../ui/src/utils/lossGraph.ts';

test('dataset keys show the dataset name and number, not the path or loss suffix', () => {
  assert.equal(formatLossKeyLabel('loss_by_dataset/d1/my-data/root/effective'), '#1 my-data');
  assert.equal(formatLossKeyLabel('loss_by_dataset/d1/my-data/root/raw'), '#1 my-data (raw)');
  assert.equal(formatLossKeyLabel('loss_by_dataset/d2/my-data/train/effective'), '#2 my-data / train');
  assert.equal(
    formatLossKeyLabel('loss_by_dataset/d3/my-data/reg_consistency_effective'),
    '#3 my-data (reg consistency)',
  );
  assert.equal(formatLossKeyLabel('loss/loss'), 'loss');
  assert.equal(formatLossKeyLabel('val/loss'), 'val loss');
});

test('parseLossKey exposes dataset identity', () => {
  const info = parseLossKey('loss_by_dataset/d4/my-data/train/raw');
  assert.equal(info.kind, 'dataset');
  assert.equal(info.datasetSeq, 4);
  assert.equal(info.datasetLabel, 'my-data');
  assert.equal(info.subdir, 'train');
  assert.equal(info.metric, 'raw');
});

test('series labels distinguish metric and rendered variant', () => {
  assert.equal(formatLossSeriesLabel('loss_by_dataset/d1/my-data/root/effective', 'ema'), '#1 my-data');
  assert.equal(formatLossSeriesLabel('loss_by_dataset/d1/my-data/root/effective', 'ma'), '#1 my-data (MA)');
  assert.equal(formatLossSeriesLabel('loss_by_dataset/d1/my-data/root/effective', 'trend'), '#1 my-data (trend)');
  assert.equal(
    formatLossSeriesLabel('loss_by_dataset/d1/my-data/root/raw', 'points'),
    '#1 my-data (raw, points)',
  );
  assert.equal(formatLossSeriesLabel('loss/loss', 'trend'), 'loss (trend)');
});

test('dataset variants share one colour identity', () => {
  const effective = 'loss_by_dataset/d1/my-data/root/effective';
  const raw = 'loss_by_dataset/d1/my-data/root/raw';
  assert.equal(seriesIdentityKey(effective), seriesIdentityKey(raw));
  assert.notEqual(seriesIdentityKey(effective), seriesIdentityKey('loss_by_dataset/d2/my-data/root/effective'));
});

test('ma window clamping and slider mapping', () => {
  assert.equal(clampMaWindow(0), MA_WINDOW_MIN);
  assert.equal(clampMaWindow(-10), MA_WINDOW_MIN);
  assert.equal(clampMaWindow(99999), MA_WINDOW_MAX);
  assert.equal(clampMaWindow(Number.NaN), DEFAULT_MA_WINDOW);

  for (const value of [2, 5, 25, 200, 1000, 2000]) {
    const roundTrip = sliderToMaWindow(maWindowToSlider(value));
    assert.ok(
      Math.abs(roundTrip - value) <= Math.max(2, value * 0.01),
      `expected ${value}, got ${roundTrip}`,
    );
  }
});

test('moving average uses an expanding warmup and keeps a band', () => {
  const stats = trailingMovingStatsWithNulls([1, 2, 3, 4, 5], 3);
  assert.deepEqual(stats.mean, [1, 1.5, 2, 3, 4]);
  assert.equal(stats.lower[0], null);
  assert.equal(stats.upper[0], null);
  for (let i = 1; i < stats.mean.length; i++) {
    assert.ok((stats.lower[i] as number) <= (stats.mean[i] as number));
    assert.ok((stats.upper[i] as number) >= (stats.mean[i] as number));
  }
});

test('a window wider than the run does not produce an empty line', () => {
  const stats = trailingMovingStatsWithNulls([2, 4, 6], 2000);
  assert.deepEqual(stats.mean, [2, 3, 4]);
  assert.ok(stats.lower[2] !== null);
  assert.ok(stats.upper[2] !== null);
});

test('gaps stay gaps and do not consume window capacity', () => {
  const stats = trailingMovingStatsWithNulls([1, null, 3], 2);
  assert.deepEqual(stats.mean, [1, null, 2]);
  assert.equal(stats.lower[1], null);
  assert.ok(Math.abs((stats.lower[2] as number) - 0.04) < 1e-9);
  assert.ok(Math.abs((stats.upper[2] as number) - 3.96) < 1e-9);
});

test('constant series has a zero-width confidence interval', () => {
  const stats = trailingMovingStatsWithNulls([5, 5, 5], 3);
  assert.deepEqual(stats.mean, [5, 5, 5]);
  assert.deepEqual(stats.lower.slice(1), [5, 5]);
  assert.deepEqual(stats.upper.slice(1), [5, 5]);
});

test('palette colours and trend patterns stay distinct', () => {
  const colours = new Set(Array.from({ length: 12 }, (_, i) => seriesColor(i)));
  assert.equal(colours.size, 12);
  assert.notDeepEqual(trendDash(0), trendDash(1));
  assert.equal(withAlpha('#4E79A7', 0.5), 'rgba(78,121,167,0.5)');
  assert.equal(withAlpha('rgba(10,20,30,1)', 0.25), 'rgba(10,20,30,0.25)');
});
