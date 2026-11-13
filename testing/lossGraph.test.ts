import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_MA_WINDOW,
  MA_WINDOW_MAX,
  MA_WINDOW_MIN,
  clampMaWindow,
  effectiveMaWindow,
  formatLossKeyLabel,
  formatLossSeriesLabel,
  maWindowToSlider,
  observationKnots,
  parseLossKey,
  seriesColor,
  seriesIdentityKey,
  shouldShowObservationKnots,
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

test('moving average waits for a full window before plotting', () => {
  const stats = trailingMovingStatsWithNulls([1, 2, 3, 4, 5], 3);
  assert.deepEqual(stats.mean, [null, null, 2, 3, 4]);
  assert.equal(stats.lower[0], null);
  assert.equal(stats.lower[1], null);
  for (let i = 2; i < stats.mean.length; i++) {
    assert.ok((stats.lower[i] as number) <= (stats.mean[i] as number));
    assert.ok((stats.upper[i] as number) >= (stats.mean[i] as number));
  }
});

test('a window wider than the run shrinks to half the run', () => {
  assert.equal(effectiveMaWindow(2000, 3), 2);
  assert.equal(effectiveMaWindow(2000, 10), 5);
  assert.equal(effectiveMaWindow(25, 100), 25);

  const stats = trailingMovingStatsWithNulls([2, 4, 6], 2000);
  assert.deepEqual(stats.mean, [null, 3, 5]);
  assert.ok(stats.lower[2] !== null);
  assert.ok(stats.upper[2] !== null);
});

test('gaps stay gaps and do not consume window capacity', () => {
  const stats = trailingMovingStatsWithNulls([1, null, 3], 2);
  assert.deepEqual(stats.mean, [null, null, 2]);
  assert.equal(stats.lower[1], null);
  assert.ok(Math.abs((stats.lower[2] as number) - 0.04) < 1e-9);
  assert.ok(Math.abs((stats.upper[2] as number) - 3.96) < 1e-9);
});

test('constant series has a zero-width confidence interval', () => {
  const stats = trailingMovingStatsWithNulls([5, 5, 5], 3);
  assert.deepEqual(stats.mean, [null, null, 5]);
  assert.equal(stats.lower[1], null);
  assert.deepEqual(stats.lower.slice(2), [5]);
  assert.deepEqual(stats.upper.slice(2), [5]);
});

test('observation knots sit on the MA value and skip unlogged steps', () => {
  const mean = [null, 1.5, 2, 3, 3.5] as (number | null)[];
  const raw = [1, 2, null, null, 5] as (number | null)[];
  assert.deepEqual(observationKnots(mean, raw), [null, 1.5, null, null, 3.5]);
});

test('observation dots are limited to sparse series while raw points are visible', () => {
  assert.equal(shouldShowObservationKnots(10, 10, true), false);
  assert.equal(shouldShowObservationKnots(5, 10, true), true);
  assert.equal(shouldShowObservationKnots(10, 10, false), true);
  assert.equal(shouldShowObservationKnots(0, 10, false), false);
  assert.equal(shouldShowObservationKnots(3, 0, false), false);
});

test('palette colours and trend patterns stay distinct', () => {
  const colours = new Set(Array.from({ length: 12 }, (_, i) => seriesColor(i)));
  assert.equal(colours.size, 12);
  assert.notDeepEqual(trendDash(0), trendDash(1));
  assert.equal(withAlpha('#4E79A7', 0.5), 'rgba(78,121,167,0.5)');
  assert.equal(withAlpha('rgba(10,20,30,1)', 0.25), 'rgba(10,20,30,0.25)');
});
