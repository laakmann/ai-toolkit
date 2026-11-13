// Pure helpers for the loss graph: metric-key labels, moving statistics, and
// series colours. Kept out of the React component so they can be unit tested.

export const MA_WINDOW_MIN = 2;
export const MA_WINDOW_MAX = 2000;
export const DEFAULT_MA_WINDOW = 25;
export const DEFAULT_CONFIDENCE_Z = 1.96;

export interface LossKeyInfo {
  raw: string;
  kind: 'dataset' | 'global' | 'other';
  /** Numeric part of the `dN` prefix, or null when the key is not a dataset key. */
  datasetSeq: number | null;
  /** Dataset name from the key. Sanitized by the trainer, never a full path. */
  datasetLabel: string | null;
  /** Subdirectory inside the dataset, or null for the dataset root. */
  subdir: string | null;
  /** Last path token, e.g. `effective`, `raw`, `reg_consistency_effective`. */
  metric: string | null;
}

function datasetMetricLabel(metric: string | null): string | null {
  if (metric === null || metric === 'effective') return null;
  if (metric === 'raw') return 'raw';
  if (metric === 'reg_consistency_effective') return 'reg consistency';
  return metric;
}

function datasetBaseLabel(info: LossKeyInfo): string {
  const bits: string[] = [];
  if (info.datasetSeq !== null) bits.push(`#${info.datasetSeq}`);
  if (info.datasetLabel) bits.push(info.datasetLabel);
  let base = bits.join(' ') || 'dataset';
  if (info.subdir && info.subdir !== 'root') base += ` / ${info.subdir}`;
  return base;
}

export function parseLossKey(key: string): LossKeyInfo {
  if (key === 'loss/loss' || key === 'val/loss') {
    return {
      raw: key,
      kind: 'global',
      datasetSeq: null,
      datasetLabel: null,
      subdir: null,
      metric: key.slice(key.lastIndexOf('/') + 1),
    };
  }

  if (key.startsWith('loss_by_dataset/')) {
    const rest = key.slice('loss_by_dataset/'.length);
    const parts = rest.split('/').filter(Boolean);
    if (parts.length < 2) {
      return {
        raw: key,
        kind: 'other',
        datasetSeq: null,
        datasetLabel: rest || null,
        subdir: null,
        metric: null,
      };
    }

    const seqMatch = /^d(\d+)$/.exec(parts[0]);
    const datasetSeq = seqMatch ? Number(seqMatch[1]) : null;
    const metric = parts[parts.length - 1];
    const middle = parts.slice(1, -1);

    // Current keys are dN/<dataset label>[/<subdir>]/<metric>. Treat a lone
    // `root` token as the old no-label shape rather than a dataset named root.
    let datasetLabel: string | null = middle[0] ?? null;
    let subdir: string | null = middle.length > 1 ? middle.slice(1).join('/') : null;
    if (middle.length === 1 && middle[0] === 'root') {
      datasetLabel = null;
      subdir = 'root';
    }

    return { raw: key, kind: 'dataset', datasetSeq, datasetLabel, subdir, metric };
  }

  return {
    raw: key,
    kind: 'other',
    datasetSeq: null,
    datasetLabel: null,
    subdir: null,
    metric: null,
  };
}

/** Compact label used by series chips and axes. */
export function formatLossKeyLabel(key: string): string {
  const info = parseLossKey(key);

  if (info.kind === 'global') return key === 'val/loss' ? 'val loss' : 'loss';

  if (info.kind === 'dataset') {
    let label = datasetBaseLabel(info);
    const metricLabel = datasetMetricLabel(info.metric);
    if (metricLabel) label += ` (${metricLabel})`;
    return label;
  }

  if (key.startsWith('loss/')) {
    const rest = key.slice('loss/'.length);
    if (rest.endsWith('/effective')) return `${rest.slice(0, -'/effective'.length)}/loss`;
    if (rest.endsWith('/raw')) return `${rest.slice(0, -'/raw'.length)}/loss_raw`;
    return rest;
  }

  return key;
}

export type LossSeriesVariant = 'ema' | 'ma' | 'points' | 'trend';

/** Label for a rendered line/points series, including metric + variant. */
export function formatLossSeriesLabel(key: string, variant: LossSeriesVariant): string {
  const info = parseLossKey(key);

  if (info.kind === 'global') {
    const base = key === 'val/loss' ? 'val loss' : 'loss';
    const suffix = variant === 'trend' ? 'trend' : variant === 'points' ? 'points' : variant === 'ma' ? 'MA' : '';
    return suffix ? `${base} (${suffix})` : base;
  }

  if (info.kind === 'dataset') {
    const parts: string[] = [];
    const metricLabel = datasetMetricLabel(info.metric);
    if (metricLabel) parts.push(metricLabel);
    if (variant === 'trend') parts.push('trend');
    else if (variant === 'points') parts.push('points');
    else if (variant === 'ma') parts.push('MA');
    const base = datasetBaseLabel(info);
    return parts.length ? `${base} (${parts.join(', ')})` : base;
  }

  return formatLossKeyLabel(key);
}

export function clampMaWindow(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_MA_WINDOW;
  return Math.min(MA_WINDOW_MAX, Math.max(MA_WINDOW_MIN, Math.round(value)));
}

// 0..1000 logarithmic slider position. Low windows stay easy to pick while the
// upper end still reaches 2,000.
export function maWindowToSlider(value: number): number {
  const clamped = clampMaWindow(value);
  return Math.round(
    (Math.log(clamped / MA_WINDOW_MIN) / Math.log(MA_WINDOW_MAX / MA_WINDOW_MIN)) * 1000,
  );
}

export function sliderToMaWindow(position: number): number {
  const p = Math.min(1000, Math.max(0, Number.isFinite(position) ? position : 0));
  return clampMaWindow(
    Math.round(MA_WINDOW_MIN * Math.pow(MA_WINDOW_MAX / MA_WINDOW_MIN, p / 1000)),
  );
}

export interface MovingStats {
  mean: (number | null)[];
  lower: (number | null)[];
  upper: (number | null)[];
}

/**
 * Trailing mean and approximate 95% confidence interval for that mean.
 *
 * The window expands while fewer than `window` valid points exist, so the line
 * remains visible when the selected window is wider than the current run.
 * Invalid/gap points remain null and do not consume window capacity. The
 * interval is mean +/- z * sampleStdDev / sqrt(n); it is not a prediction band.
 */
export function trailingMovingStatsWithNulls(
  ys: (number | null)[],
  window: number,
  z: number = DEFAULT_CONFIDENCE_Z,
): MovingStats {
  const mean: (number | null)[] = new Array(ys.length).fill(null);
  const lower: (number | null)[] = new Array(ys.length).fill(null);
  const upper: (number | null)[] = new Array(ys.length).fill(null);

  const w = clampMaWindow(window);
  const ring = new Float64Array(w);
  let count = 0;
  let index = 0;
  let sum = 0;
  let sumSq = 0;

  for (let i = 0; i < ys.length; i++) {
    const v = ys[i];
    if (v === null || !Number.isFinite(v)) continue;

    if (count === w) {
      const old = ring[index];
      sum -= old;
      sumSq -= old * old;
    } else {
      count += 1;
    }

    ring[index] = v;
    sum += v;
    sumSq += v * v;
    index = (index + 1) % w;

    const avg = sum / count;
    mean[i] = avg;

    if (count >= 2) {
      // Clamp tiny negative values caused by floating-point cancellation.
      const variance = Math.max(0, (sumSq - count * avg * avg) / (count - 1));
      const margin = z * Math.sqrt(variance / count);
      lower[i] = avg - margin;
      upper[i] = avg + margin;
    }
  }

  return { mean, lower, upper };
}

// Tableau-style categorical palette, ordered so the first few series are
// maximally separated on the dark chart background.
export const SERIES_PALETTE = [
  '#4E79A7', // blue
  '#F28E2B', // orange
  '#59A14F', // green
  '#E15759', // red
  '#B07AA1', // purple
  '#76B7B2', // teal
  '#EDC948', // yellow
  '#FF9DA7', // pink
  '#9C755F', // brown
  '#BAB0AC', // grey
  '#A0CBE8', // light blue
  '#FFBE7D', // light orange
  '#8CD17D', // light green
  '#D4A6C8', // light purple
  '#86BCB6', // light teal
  '#F1CE63', // light yellow
];

function hslToHex(h: number, s: number, l: number): string {
  const saturation = s / 100;
  const lightness = l / 100;
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const hPrime = (((h % 360) + 360) % 360) / 60;
  const x = chroma * (1 - Math.abs((hPrime % 2) - 1));
  const m = lightness - chroma / 2;
  let r = 0;
  let g = 0;
  let b = 0;
  if (hPrime < 1) [r, g, b] = [chroma, x, 0];
  else if (hPrime < 2) [r, g, b] = [x, chroma, 0];
  else if (hPrime < 3) [r, g, b] = [0, chroma, x];
  else if (hPrime < 4) [r, g, b] = [0, x, chroma];
  else if (hPrime < 5) [r, g, b] = [x, 0, chroma];
  else [r, g, b] = [chroma, 0, x];
  const toByte = (v: number) => Math.round((v + m) * 255).toString(16).padStart(2, '0');
  return `#${toByte(r)}${toByte(g)}${toByte(b)}`;
}

/** Stable categorical colour for a palette slot; extends beyond the base list. */
export function seriesColor(index: number): string {
  const i = Math.max(0, Math.floor(Number.isFinite(index) ? index : 0));
  if (i < SERIES_PALETTE.length) return SERIES_PALETTE[i];
  // Golden-angle hue rotation gives well-separated extra hues without cycling
  // straight back to the first colours.
  const hue = (i * 137.508 + 23) % 360;
  const lightness = i % 2 === 0 ? 62 : 48;
  return hslToHex(hue, 68, lightness);
}

export function seriesIdentityKey(key: string): string {
  const info = parseLossKey(key);
  if (info.kind === 'dataset') {
    if (info.datasetSeq !== null) return `dataset:${info.datasetSeq}`;
    if (info.datasetLabel) return `dataset-label:${info.datasetLabel}`;
  }
  return `key:${key}`;
}

/** Add alpha to a hex/rgb colour; falls back to the original on parse failure. */
export function withAlpha(color: string, alpha: number): string {
  const a = Math.min(1, Math.max(0, alpha));
  let r: number;
  let g: number;
  let b: number;

  if (color.startsWith('#')) {
    const hex = color.slice(1);
    if (hex.length === 3) {
      r = parseInt(hex[0] + hex[0], 16);
      g = parseInt(hex[1] + hex[1], 16);
      b = parseInt(hex[2] + hex[2], 16);
    } else if (hex.length === 6) {
      r = parseInt(hex.slice(0, 2), 16);
      g = parseInt(hex.slice(2, 4), 16);
      b = parseInt(hex.slice(4, 6), 16);
    } else {
      return color;
    }
  } else {
    const m = color.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
    if (!m) return color;
    r = Number(m[1]);
    g = Number(m[2]);
    b = Number(m[3]);
  }

  if (![r, g, b].every(Number.isFinite)) return color;
  return `rgba(${r},${g},${b},${a})`;
}

const TREND_DASHES: number[][] = [
  [6, 4],
  [2, 3],
  [10, 3, 2, 3],
  [4, 2],
  [1, 4],
  [8, 3, 2, 3],
  [3, 3],
  [12, 4, 2, 4],
];

export function trendDash(index: number): number[] {
  const i = Math.abs(Math.floor(Number.isFinite(index) ? index : 0)) % TREND_DASHES.length;
  return TREND_DASHES[i];
}

/** Extra dash used to distinguish metric variants that share a dataset colour. */
export function metricDash(metric: string | null): number[] | undefined {
  if (metric === 'raw') return [7, 4];
  if (metric === 'reg_consistency_effective') return [2, 2];
  return undefined;
}
