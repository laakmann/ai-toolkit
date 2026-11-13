'use client';

import { Job } from '@prisma/client';
import useJobLossLog, { LossSeries } from '@/hooks/useJobLossLog';
import { useMemo, useState, useEffect, useRef, useCallback } from 'react';
import uPlot from 'uplot';
import 'uplot/dist/uPlot.min.css';
import { openConfirm } from '@/components/ConfirmModal';
import { Check, ChevronDown } from 'lucide-react';
import classNames from 'classnames';
import {
  DEFAULT_MA_WINDOW,
  MA_WINDOW_MAX,
  MA_WINDOW_MIN,
  clampMaWindow,
  formatLossKeyLabel,
  formatLossSeriesLabel,
  followTailRange,
  maWindowToSlider,
  metricDash,
  observationKnots,
  parseLossKey,
  selectionEndsAtTail,
  seriesColor,
  shouldShowObservationKnots,
  sliderToMaWindow,
  trailingMovingStatsWithNulls,
  trendDash,
  withAlpha,
} from '@/utils/lossGraph';

interface Props {
  job: Job;
}

function formatNum(v: number) {
  if (!Number.isFinite(v)) return '';
  if (v === 0) return '0';
  const abs = Math.abs(v);
  // Very small / very large magnitudes read better as exponents (e.g. 1.00e-5)
  // than as long decimal strings like 0.0000100.
  if (abs < 1e-3 || abs >= 1e6) return v.toExponential(2);
  if (abs >= 1000) return v.toFixed(0);
  if (abs >= 10) return v.toFixed(3);
  if (abs >= 1) return v.toFixed(4);
  return v.toPrecision(4);
}

function clamp01(x: number) {
  return Math.max(0, Math.min(1, x));
}

// Fallback canvas height used before the container has been measured.
const FALLBACK_CANVAS_HEIGHT = 360;
const MIN_CANVAS_HEIGHT = 160;

// Compute canvas size so uPlot's canvas + its HTML legend fit inside `host`.
// `host` should be a layout-controlled wrapper (NOT the uPlot mount node, since
// uPlot's stylesheet sets `width: min-content` on its mount node).
function computeCanvasSize(host: HTMLElement): { width: number; height: number } | null {
  const { width, height } = host.getBoundingClientRect();
  if (width <= 0 || height <= 0) return null;
  const legend = host.querySelector('.u-legend') as HTMLElement | null;
  const legendH = legend?.getBoundingClientRect().height ?? 0;
  return { width, height: Math.max(MIN_CANVAS_HEIGHT, height - legendH) };
}

function emaPass(
  ys: (number | null)[],
  alpha: number,
  reverse: boolean,
): { vals: (number | null)[]; weights: number[] } {
  const vals: (number | null)[] = new Array(ys.length).fill(null);
  const weights: number[] = new Array(ys.length).fill(0);
  let s = 0;
  let n = 0;
  const start = reverse ? ys.length - 1 : 0;
  const step = reverse ? -1 : 1;
  for (let i = start; i >= 0 && i < ys.length; i += step) {
    const v = ys[i];
    if (v === null || !Number.isFinite(v)) continue;
    s = alpha * (v as number) + (1 - alpha) * s;
    n += 1;
    const w = 1 - Math.pow(1 - alpha, n);
    vals[i] = s / w;
    weights[i] = w;
  }
  return { vals, weights };
}

function emaWithNulls(ys: (number | null)[], alpha: number): (number | null)[] {
  const fwd = emaPass(ys, alpha, false);
  const bwd = emaPass(ys, alpha, true);
  const out: (number | null)[] = new Array(ys.length);
  for (let i = 0; i < ys.length; i++) {
    const f = fwd.vals[i];
    const b = bwd.vals[i];
    if (f === null || b === null) {
      out[i] = null;
      continue;
    }
    const wf = fwd.weights[i];
    const wb = bwd.weights[i];
    const wsum = wf + wb;
    out[i] = wsum > 0 ? (wf * (f as number) + wb * (b as number)) / wsum : ((f as number) + (b as number)) / 2;
  }
  return out;
}

// Trailing moving average / confidence stats live in utils/lossGraph.ts.

// Hue order is deliberate: adjacent slots are maximally separated for
// colorblind viewers, validated against the gray-950 chart surface.
// (Palette lives in utils/lossGraph.ts.)

// Persisted, per-URL graph settings. Sliders + display toggles + which loss
// series are visible. Zoom / highlighted window is intentionally NOT persisted.
interface PersistedSettings {
  smoothingMode: 'ema' | 'ma';
  useLogScale: boolean;
  sharedAxis: boolean;
  followTail: boolean;
  showRawSeries: boolean;
  showAuxSeries: boolean;
  showTrend: boolean;
  emaSmoothing: number;
  showMovingAverage: boolean;
  showRawPoints: boolean;
  showObservationDots: boolean;
  showConfidenceBand: boolean;
  maWindow: number;
  plotStride: number;
  clipOutliers: boolean;
  enabled: Record<string, boolean>;
}

// Key by the exact URL so each job remembers its own settings independently.
function settingsStorageKey(): string | null {
  if (typeof window === 'undefined') return null;
  return `jobLossGraph:${window.location.pathname}${window.location.search}`;
}

function hasFinitePoints(s: LossSeries | undefined): boolean {
  if (!s || s.values.length === 0) return false;
  for (const v of s.values) {
    if (Number.isFinite(v)) return true;
  }
  return false;
}

function isAuxiliarySeriesKey(key: string): boolean {
  return key === 'bad_state_guard/applied'
    || key.includes('/reg_consistency_effective')
    || key.startsWith('loss/reg_consistency/')
    || key.startsWith('loss/bad_state_guard/');
}

export default function JobLossGraph({ job }: Props) {
  const { series, lossKeys, status, refreshLoss, deleteRange } = useJobLossLog(job.id, 2000);

  // Controls
  const [smoothingMode, setSmoothingMode] = useState<'ema' | 'ma'>('ema');
  const [useLogScale, setUseLogScale] = useState(false);
  const [sharedAxis, setSharedAxis] = useState(true);
  const [followTail, setFollowTail] = useState(true);
  const [showRawSeries, setShowRawSeries] = useState(false);
  const [showAuxSeries, setShowAuxSeries] = useState(false);
  const [showTrend, setShowTrend] = useState(true);
  const [emaSmoothing, setEmaSmoothing] = useState(80);
  const [showMovingAverage, setShowMovingAverage] = useState(true);
  const [showRawPoints, setShowRawPoints] = useState(true);
  const [showObservationDots, setShowObservationDots] = useState(true);
  const [showConfidenceBand, setShowConfidenceBand] = useState(false);

  // Number of recent valid samples used per series for central tendency.
  const [maWindow, setMaWindow] = useState(DEFAULT_MA_WINDOW);
  const [maInput, setMaInput] = useState(String(DEFAULT_MA_WINDOW));
  useEffect(() => {
    setMaInput(String(maWindow));
  }, [maWindow]);

  const commitMaInput = () => {
    const next = clampMaWindow(Number(maInput));
    setMaWindow(next);
    setMaInput(String(next));
  };

  // Series selector collapses on mobile so many datasets stay manageable.
  // Defaults to expanded on desktop after mount.
  const [seriesPanelOpen, setSeriesPanelOpen] = useState(false);
  useEffect(() => {
    setSeriesPanelOpen(window.matchMedia('(min-width: 768px)').matches);
  }, []);

  // UI-only downsample for rendering speed
  const [plotStride, setPlotStride] = useState(1);

  // show only last N points in the chart (0 = all)
  const [windowSize] = useState<number>(0);

  // quick y clipping for readability
  const [clipOutliers, setClipOutliers] = useState(false);

  // which loss series are enabled (default: all enabled)
  const [enabled, setEnabled] = useState<Record<string, boolean>>({});

  const [isZoomed, setIsZoomed] = useState(false);

  // Gate persistence writes until we've loaded any stored settings, so the
  // initial defaults don't clobber what was saved before the load effect runs.
  const [hydrated, setHydrated] = useState(false);

  // Restored series selection, kept so the lossKeys-sync effect can honor it for
  // keys that arrive after load rather than falling back to the default.
  const persistedEnabledRef = useRef<Record<string, boolean> | null>(null);

  // Load persisted settings for this job's URL. Re-runs when the job changes
  // (navigating between jobs) so each URL restores its own saved state.
  useEffect(() => {
    setHydrated(false);
    persistedEnabledRef.current = null;
    const key = settingsStorageKey();
    if (!key) {
      setHydrated(true);
      return;
    }
    try {
      const raw = localStorage.getItem(key);
      if (raw) {
        const s = JSON.parse(raw) as Partial<PersistedSettings> & { smoothing?: number };
        if (s.smoothingMode === 'ema' || s.smoothingMode === 'ma') {
          setSmoothingMode(s.smoothingMode);
        } else if (
          typeof s.showMovingAverage === 'boolean'
          || typeof s.showRawPoints === 'boolean'
          || typeof s.maWindow === 'number'
        ) {
          setSmoothingMode('ma');
        }
        if (typeof s.useLogScale === 'boolean') setUseLogScale(s.useLogScale);
        if (typeof s.sharedAxis === 'boolean') setSharedAxis(s.sharedAxis);
        if (typeof s.followTail === 'boolean') setFollowTail(s.followTail);
        if (typeof s.showRawSeries === 'boolean') setShowRawSeries(s.showRawSeries);
        if (typeof s.showAuxSeries === 'boolean') setShowAuxSeries(s.showAuxSeries);
        if (typeof s.showTrend === 'boolean') setShowTrend(s.showTrend);
        if (typeof s.emaSmoothing === 'number') setEmaSmoothing(s.emaSmoothing);
        else if (typeof s.smoothing === 'number') setEmaSmoothing(s.smoothing);
        if (typeof s.showMovingAverage === 'boolean') setShowMovingAverage(s.showMovingAverage);
        if (typeof s.showRawPoints === 'boolean') setShowRawPoints(s.showRawPoints);
        if (typeof s.showObservationDots === 'boolean') setShowObservationDots(s.showObservationDots);
        if (typeof s.showConfidenceBand === 'boolean') setShowConfidenceBand(s.showConfidenceBand);
        if (typeof s.maWindow === 'number') setMaWindow(clampMaWindow(s.maWindow));
        else if (typeof s.smoothing === 'number') {
          const mappedWindow = Math.round(2 + clamp01(s.smoothing / 100) * 198);
          setMaWindow(clampMaWindow(mappedWindow));
        }
        if (typeof s.plotStride === 'number') setPlotStride(s.plotStride);
        if (typeof s.clipOutliers === 'boolean') setClipOutliers(s.clipOutliers);
        if (s.enabled && typeof s.enabled === 'object') {
          persistedEnabledRef.current = s.enabled;
          setEnabled(s.enabled);
        }
      }
    } catch {
      // ignore malformed / unavailable storage
    }
    setHydrated(true);
  }, [job.id]);

  // Persist settings whenever they change (after the initial load).
  useEffect(() => {
    if (!hydrated) return;
    const key = settingsStorageKey();
    if (!key) return;
    try {
      const payload: PersistedSettings = {
        smoothingMode,
        useLogScale,
        sharedAxis,
        followTail,
        showRawSeries,
        showAuxSeries,
        showTrend,
        emaSmoothing,
        showMovingAverage,
        showRawPoints,
        showObservationDots,
        showConfidenceBand,
        maWindow,
        plotStride,
        clipOutliers,
        enabled,
      };
      localStorage.setItem(key, JSON.stringify(payload));
    } catch {
      // ignore unavailable storage
    }
  }, [
    hydrated,
    smoothingMode,
    useLogScale,
    sharedAxis,
    followTail,
    showRawSeries,
    showAuxSeries,
    showTrend,
    emaSmoothing,
    showMovingAverage,
    showRawPoints,
    showObservationDots,
    showConfidenceBand,
    maWindow,
    plotStride,
    clipOutliers,
    enabled,
  ]);

  const keyLabelByKey = useMemo(() => {
    const labels: Record<string, string> = {};
    for (const key of lossKeys) {
      labels[key] = formatLossKeyLabel(key);
    }
    return labels;
  }, [lossKeys]);

  const visibleLossKeys = useMemo(() => {
    return lossKeys.filter(key => {
      if (!showRawSeries && key.endsWith('/raw')) return false;
      if (!showAuxSeries && isAuxiliarySeriesKey(key)) return false;
      if (!hasFinitePoints(series[key])) return false;
      return true;
    });
  }, [lossKeys, showRawSeries, showAuxSeries, series]);

  // keep enabled map in sync with discovered keys. "loss/loss" and "val/loss"
  // are on by default; every other metric starts deactivated (user can toggle
  // it on).
  useEffect(() => {
    // Nothing discovered yet — don't prune, or we'd wipe a restored selection
    // before the keys have loaded.
    if (lossKeys.length === 0) return;
    setEnabled(prev => {
      const next = { ...prev };
      for (const k of lossKeys) {
        if (next[k] === undefined)
          next[k] = persistedEnabledRef.current?.[k] ?? (k === 'loss/loss' || k === 'val/loss');
      }
      for (const k of Object.keys(next)) {
        if (!lossKeys.includes(k)) delete next[k];
      }
      return next;
    });
  }, [lossKeys]);

  // Keys not yet in `enabled` (data and keys now arrive in the same render,
  // before the sync effect above has run) take their default here rather than
  // rendering as enabled and getting pruned a frame later.
  const isSeriesSelected = useCallback(
    (key: string) =>
      enabled[key] ?? persistedEnabledRef.current?.[key] ?? (key === 'loss/loss' || key === 'val/loss'),
    [enabled],
  );

  const activeKeys = useMemo(
    () => visibleLossKeys.filter(isSeriesSelected),
    [visibleLossKeys, isSeriesSelected],
  );

  // Assign colours by dataset sequence so d1/d2/... always use the first
  // palette slots. Hidden/aux global keys therefore never consume a dataset
  // colour. Keyed off lossKeys so toggling never repaints.
  const { colorByKey, trendDashByKey } = useMemo(() => {
    const colors: Record<string, string> = {};
    const dashes: Record<string, number[]> = {};
    let extra = 0;

    for (const key of lossKeys) {
      const info = parseLossKey(key);
      if (info.kind === 'dataset' && info.datasetSeq !== null) {
        const slot = Math.max(0, info.datasetSeq - 1);
        colors[key] = seriesColor(slot);
        dashes[key] = trendDash(slot);
        continue;
      }

      if (key === 'loss/loss') {
        colors[key] = '#E5E7EB';
        dashes[key] = trendDash(extra);
      } else if (key === 'val/loss') {
        colors[key] = '#94A3B8';
        dashes[key] = trendDash(extra);
      } else {
        colors[key] = seriesColor(24 + extra);
        dashes[key] = trendDash(extra + 8);
      }
      extra += 1;
    }

    return { colorByKey: colors, trendDashByKey: dashes };
  }, [lossKeys]);

  // Build uPlot-aligned data + series configs.
  const built = useMemo(() => {
    const stride = Math.max(1, plotStride | 0);
    const t = clamp01(emaSmoothing / 100);
    const emaAlpha = 1.0 - t * 0.98;
    const trendAlpha = 0.005;

    // Union of all steps across active series.
    const stepSet = new Set<number>();
    for (const key of activeKeys) {
      const s: LossSeries | undefined = series[key];
      if (!s) continue;
      for (let i = 0; i < s.steps.length; i++) {
        const v = s.values[i];
        if (!Number.isFinite(v)) continue;
        stepSet.add(s.steps[i]);
      }
    }
    let xs = Array.from(stepSet).sort((a, b) => a - b);
    if (stride > 1) xs = xs.filter((_, i) => i % stride === 0);
    if (windowSize > 0 && xs.length > windowSize) xs = xs.slice(xs.length - windowSize);

    const xsSet = new Set(xs);

    // Pass 1: align every active series to the shared x grid, keeping both the
    // full and positive-only maps so a shared axis can pick its distribution
    // once for all series.
    const prepared = activeKeys.map(key => {
      const s: LossSeries = series[key] ?? { steps: [], values: [] };
      const mapAll = new Map<number, number>();
      const mapLog = new Map<number, number>();
      let positiveCount = 0;
      for (let i = 0; i < s.steps.length; i++) {
        const value = s.values[i];
        if (!Number.isFinite(value)) continue;
        if (!xsSet.has(s.steps[i])) continue;
        mapAll.set(s.steps[i], value);
        if (value > 0) {
          mapLog.set(s.steps[i], value);
          positiveCount += 1;
        }
      }
      return { key, keyLabel: keyLabelByKey[key] ?? key, mapAll, mapLog, positiveCount };
    });

    // A shared log axis needs at least one series with positive samples.
    // Non-positive points are dropped in log mode, exactly as they are on a
    // per-series log axis today.
    const sharedLogActive = sharedAxis && useLogScale && prepared.some(p => p.positiveCount >= 2);

    const makeScale = (scaleKey: string, logScale: boolean): uPlot.Scale => ({
      distr: logScale ? 3 : 1,
      range: (_u, dataMin, dataMax) => {
        const c = yClipRef.current?.[scaleKey];
        if (c) return [c.min, c.max];
        if (!Number.isFinite(dataMin) || !Number.isFinite(dataMax)) return [0, 1];
        if (dataMin === dataMax) {
          if (logScale) {
            const v = dataMin > 0 ? dataMin : 1e-6;
            return [Math.max(v * 0.9, 1e-6), Math.max(v * 1.1, 1e-5)];
          }
          return [dataMin - 0.5, dataMax + 0.5];
        }
        return [dataMin, dataMax];
      },
    });

    const data: (number[] | (number | null)[])[] = [xs];
    const seriesConfigs: uPlot.Series[] = [{}]; // x
    const bands: uPlot.Band[] = [];

    // Each metric gets its own y-scale (so unrelated magnitudes auto-range
    // independently) plus a matching colored axis. With `sharedAxis` every
    // series uses a single neutral `y` scale instead.
    const scales: uPlot.Scales = { x: { time: false } };
    const axes: uPlot.Axis[] = [
      {
        stroke: 'rgba(255,255,255,0.55)',
        grid: { stroke: 'rgba(255,255,255,0.06)' },
        ticks: { stroke: 'rgba(255,255,255,0.15)' },
      },
    ];

    if (sharedAxis) scales.y = makeScale('y', sharedLogActive);

    // Data columns belonging to each scale, for per-scale clip percentiles.
    const scaleArrays: Record<string, (number | null)[][]> = {};

    for (let ki = 0; ki < prepared.length; ki++) {
      const { key, keyLabel, mapAll, mapLog, positiveCount } = prepared[ki];
      const scaleKey = sharedAxis ? 'y' : `y::${key}`;
      const useSeriesLogScale = sharedAxis ? sharedLogActive : useLogScale && positiveCount >= 2;
      const map = useSeriesLogScale ? mapLog : mapAll;
      const raw: (number | null)[] = xs.map(s => (map.has(s) ? (map.get(s) as number) : null));
      const movingStats = trailingMovingStatsWithNulls(raw, maWindow);
      const smooth = emaWithNulls(raw, emaAlpha);
      const trend = emaWithNulls(raw, trendAlpha);

      const color = colorByKey[key] ?? seriesColor(0);
      const trendColor = withAlpha(color, 0.72);
      const keyInfo = parseLossKey(key);
      const variantDash = metricDash(keyInfo.metric);
      const trendLineDash = trendDashByKey[key] ?? trendDash(0);

      const visiblePointCount = raw.reduce<number>((n, v) => (v === null || !Number.isFinite(v) ? n : n + 1), 0);
      let contiguousSegmentCount = 0;
      for (let i = 1; i < raw.length; i++) {
        if (raw[i] !== null && raw[i - 1] !== null) contiguousSegmentCount += 1;
      }
      const isolatedPointsOnly = visiblePointCount > 0 && contiguousSegmentCount === 0;
      const showSparsePoints = visiblePointCount > 0 && (visiblePointCount <= 2 || isolatedPointsOnly);

      const colArrays: (number | null)[][] = [];

      if (smoothingMode === 'ema') {
        data.push(smooth);
        seriesConfigs.push({
          label: formatLossSeriesLabel(key, 'ema'),
          scale: scaleKey,
          stroke: color,
          width: 2,
          dash: variantDash,
          spanGaps: true,
          points: showSparsePoints ? { show: true, size: 6 } : { show: false },
          value: (_u, value) => formatNum(value),
        });
        colArrays.push(smooth);

        if (showTrend && visiblePointCount >= 3) {
          data.push(trend);
          seriesConfigs.push({
            label: formatLossSeriesLabel(key, 'trend'),
            scale: scaleKey,
            stroke: trendColor,
            width: 2,
            dash: trendLineDash,
            spanGaps: true,
            points: { show: false },
            value: (_u, value) => formatNum(value),
          });
          colArrays.push(trend);
        }
      } else {
        const showMa = showMovingAverage && visiblePointCount >= 2;

        // Draw the confidence band first so its translucent fill sits behind
        // the raw points and the mean line. Bound columns exist whenever CI is
        // enabled (even while all bounds are null) so the series shape stays
        // stable as points arrive.
        if (showConfidenceBand && showMovingAverage) {
          // Confidence bands are meaningless on a log axis when the lower
          // bound is at or below zero; drop those edge points instead.
          const guard = (v: number | null) =>
            useSeriesLogScale && v !== null && v <= 0 ? null : v;
          const lower = movingStats.lower.map(guard);
          const upper = movingStats.upper.map(guard);

          const lowerIndex = data.length;
          data.push(lower);
          seriesConfigs.push({
            label: `${keyLabel} CI low`,
            class: 'u-ci-band',
            scale: scaleKey,
            stroke: 'transparent',
            width: 0,
            fill: 'transparent',
            // Span gaps so a sparse series (e.g. a per-dataset metric) still
            // produces one continuous shaded region between its observations
            // instead of isolated vertical ticks.
            spanGaps: true,
            points: { show: false },
            value: () => '',
          });
          colArrays.push(lower);

          const upperIndex = data.length;
          data.push(upper);
          seriesConfigs.push({
            label: `${keyLabel} CI high`,
            class: 'u-ci-band',
            scale: scaleKey,
            stroke: 'transparent',
            width: 0,
            fill: 'transparent',
            spanGaps: true,
            points: { show: false },
            value: () => '',
          });
          colArrays.push(upper);

          bands.push({
            series: [upperIndex, lowerIndex],
            fill: withAlpha(color, 0.13),
          });
        }

        if (showRawPoints) {
          seriesConfigs.push({
            label: formatLossSeriesLabel(key, 'points'),
            scale: scaleKey,
            stroke: color,
            width: 1,
            paths: () => null,
            spanGaps: false,
            points: { show: true, size: 4, width: 0 },
            value: (_u, value) => formatNum(value),
          });
          data.push(raw);
          colArrays.push(raw);
        }

        if (showMa) {
          data.push(movingStats.mean);
          seriesConfigs.push({
            label: formatLossSeriesLabel(key, 'ma'),
            scale: scaleKey,
            stroke: color,
            width: 2,
            dash: variantDash,
            spanGaps: true,
            points: { show: false },
            value: (_u, value) => formatNum(value),
          });
          colArrays.push(movingStats.mean);

          // Knots mark where the series was actually logged. They are redundant
          // on dense series while raw points are visible, so the helper limits
          // them to series with real gaps (or whenever raw points are hidden).
          if (
            showObservationDots &&
            shouldShowObservationKnots(visiblePointCount, raw.length, showRawPoints)
          ) {
            const knots = observationKnots(movingStats.mean, raw);
            data.push(knots);
            seriesConfigs.push({
              label: `${keyLabel} observations`,
              class: 'u-obs-dots',
              scale: scaleKey,
              stroke: color,
              width: 0,
              paths: () => null,
              spanGaps: false,
              points: { show: true, size: 3, width: 0 },
              value: () => '',
            });
            colArrays.push(knots);
          }
        }
      }

      const bucket = scaleArrays[scaleKey] ?? (scaleArrays[scaleKey] = []);
      bucket.push(...colArrays);

      if (!sharedAxis) {
        scales[scaleKey] = makeScale(scaleKey, useSeriesLogScale);

        axes.push({
          scale: scaleKey,
          side: ki % 2 === 0 ? 3 : 1, // alternate left / right
          stroke: color,
          label: useLogScale && !useSeriesLogScale ? `${keyLabel} (lin)` : keyLabel,
          labelSize: 14,
          // Only the first scale draws gridlines; overlaying grids from multiple
          // independent scales would be unreadable.
          grid: { show: ki === 0, stroke: 'rgba(255,255,255,0.06)' },
          ticks: { stroke: 'rgba(255,255,255,0.15)' },
          size: 60,
          values: (_u, ticks) => ticks.map(tk => formatNum(tk)),
        });
      }
    }

    // One neutral axis for every series; the legend and series chips carry the
    // per-series identity instead of the axis colours.
    if (sharedAxis) {
      axes.push({
        scale: 'y',
        side: 3,
        stroke: 'rgba(255,255,255,0.55)',
        label: sharedLogActive ? 'shared loss (log)' : useLogScale ? 'shared loss (linear)' : 'shared loss',
        labelSize: 14,
        grid: { show: true, stroke: 'rgba(255,255,255,0.06)' },
        ticks: { stroke: 'rgba(255,255,255,0.15)' },
        size: 60,
        values: (_u, ticks) => ticks.map(tk => formatNum(tk)),
      });
    }

    // y-domain clipping (2nd–98th percentile), computed per scale.
    let yClip: Record<string, { min: number; max: number }> | null = null;
    if (clipOutliers && xs.length >= 10) {
      yClip = {};
      for (const scaleKey of Object.keys(scaleArrays)) {
        const vals: number[] = [];
        for (const arr of scaleArrays[scaleKey]) {
          for (const v of arr) {
            if (v !== null && Number.isFinite(v)) vals.push(v as number);
          }
        }
        if (vals.length >= 10) {
          vals.sort((a, b) => a - b);
          const lo = vals[Math.floor(vals.length * 0.02)];
          const hi = vals[Math.ceil(vals.length * 0.98) - 1];
          if (Number.isFinite(lo) && Number.isFinite(hi) && lo !== hi) {
            yClip[scaleKey] = { min: lo, max: hi };
          }
        }
      }
    }

    return { data: data as uPlot.AlignedData, seriesConfigs, scales, axes, bands, yClip };
  }, [
    series,
    activeKeys,
    smoothingMode,
    showTrend,
    emaSmoothing,
    maWindow,
    plotStride,
    windowSize,
    useLogScale,
    sharedAxis,
    showMovingAverage,
    showRawPoints,
    showObservationDots,
    showConfidenceBand,
    clipOutliers,
    keyLabelByKey,
    colorByKey,
    trendDashByKey,
  ]);

  // Layout wrapper we measure for sizing — uPlot collapses its own mount node
  // to width:min-content, so we can't read sizes off it.
  const chartHostRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const uplotRef = useRef<uPlot | null>(null);

  // Latest per-scale yClip read by the y-scale range fns — kept current via effect.
  const yClipRef = useRef<Record<string, { min: number; max: number }> | null>(null);
  useEffect(() => {
    yClipRef.current = built.yClip;
  }, [built.yClip]);

  // Track zoom state via ref so the data-update effect can decide whether to refit scales.
  const isZoomedRef = useRef(false);
  useEffect(() => {
    isZoomedRef.current = isZoomed;
  }, [isZoomed]);

  // Structural recreate key — recreate uPlot only when the series shape or
  // axis distribution changes. Data updates go through setData.
  const hasData = (built.data[0]?.length ?? 0) > 1;
  const structuralKey = useMemo(
    () => `${activeKeys.join('|')}|mode=${smoothingMode}|trend=${showTrend}|ma=${showMovingAverage}|pts=${showRawPoints}|dots=${showObservationDots}|ci=${showConfidenceBand && smoothingMode === 'ma' && showMovingAverage}|log=${useLogScale}|shared=${sharedAxis}|has=${hasData}`,
    [
      activeKeys,
      smoothingMode,
      showTrend,
      showMovingAverage,
      showRawPoints,
      showObservationDots,
      showConfidenceBand,
      useLogScale,
      sharedAxis,
      hasData,
    ],
  );

  useEffect(() => {
    if (uplotRef.current) {
      uplotRef.current.destroy();
      uplotRef.current = null;
    }
    if (!containerRef.current || !chartHostRef.current) return;
    if (!hasData) return;

    const host = chartHostRef.current;
    const rect = host.getBoundingClientRect();
    const initialHeight = rect.height > 0 ? Math.max(MIN_CANVAS_HEIGHT, rect.height - 40) : FALLBACK_CANVAS_HEIGHT;
    const opts: uPlot.Options = {
      width: rect.width || 800,
      height: initialHeight,
      padding: [12, 16, 0, 4],
      series: built.seriesConfigs,
      scales: built.scales,
      axes: built.axes,
      bands: built.bands,
      cursor: {
        drag: { x: true, y: false, setScale: true },
        points: { size: 6 },
      },
      legend: { show: true },
      hooks: {
        setScale: [
          (u, key) => {
            if (key !== 'x') return;
            const xs = u.data[0] as number[];
            if (!xs || !xs.length) return;
            const sx = u.scales.x;
            const zoomed = sx.min !== xs[0] || sx.max !== xs[xs.length - 1];
            setIsZoomed(zoomed);
          },
        ],
      },
    };

    uplotRef.current = new uPlot(opts, built.data, containerRef.current);
    setIsZoomed(false);

    // Right-size the canvas against the legend height so it fills the remaining
    // vertical space. Defer to the next frame: the legend's height depends on
    // how many series wrap, and that layout isn't settled synchronously after
    // construction — measuring now would read a stale height (the bug that
    // previously required a manual resize to correct).
    const raf = requestAnimationFrame(() => {
      const u = uplotRef.current;
      if (!u) return;
      const fitted = computeCanvasSize(host);
      if (fitted) u.setSize(fitted);
    });

    return () => {
      cancelAnimationFrame(raf);
      uplotRef.current?.destroy();
      uplotRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [structuralKey]);

  // Latest follow-tail setting, read by the data-update effect without
  // recreating uPlot when it changes.
  const followTailRef = useRef(followTail);
  useEffect(() => {
    followTailRef.current = followTail;
  }, [followTail]);

  // Push new data without recreating — preserves zoom & cursor state.
  useEffect(() => {
    const u = uplotRef.current;
    if (!u) return;
    // When zoomed, pass resetScales=false so the user's view stays put. uPlot
    // skips its commit() in that branch though, so force a redraw to actually
    // re-render the new smoothed/strided values within the zoom window.
    if (isZoomedRef.current) {
      const prevXs = u.data[0] as number[];
      const nextXs = built.data[0] as number[];
      const prevFirst = prevXs.length ? prevXs[0] : null;
      const prevLast = prevXs.length ? prevXs[prevXs.length - 1] : null;
      const nextLast = nextXs.length ? nextXs[nextXs.length - 1] : null;
      const sx = u.scales.x;

      // A selected range whose right edge reaches the newest point keeps
      // following the tail: the left edge stays put and the right edge grows
      // as new observations arrive.
      const followRange =
        followTailRef.current &&
        selectionEndsAtTail(sx.max, prevFirst, prevLast, u.bbox.width)
          ? followTailRange(sx.min, prevLast, nextLast)
          : null;

      u.setData(built.data, false);

      if (followRange) {
        // setScale commits and redraws with the new data, so no extra redraw.
        u.setScale('x', followRange);
      } else {
        u.redraw(true, true);
      }
    } else {
      u.setData(built.data, true);
    }
  }, [built]);

  // Resize observer — fit canvas to the wrapper's available space minus the
  // HTML legend uPlot renders below it. Observe the layout wrapper, not the
  // uPlot mount node (which uPlot pins to width:min-content).
  // Re-runs on `hasData` because the observed element only exists once data
  // has loaded (see the `!hasData` branch below).
  useEffect(() => {
    const el = chartHostRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const u = uplotRef.current;
      if (!u) return;
      const fitted = computeCanvasSize(el);
      if (fitted) u.setSize(fitted);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [hasData]);

  const handleResetZoom = useCallback(() => {
    const u = uplotRef.current;
    if (!u) return;
    const xs = u.data[0] as number[];
    if (!xs || !xs.length) return;
    u.setScale('x', { min: xs[0], max: xs[xs.length - 1] });
  }, []);

  const [deleting, setDeleting] = useState(false);

  // Delete every logged step inside the current zoom window, then zoom back out.
  const handleDeleteSelectedRange = useCallback(() => {
    const u = uplotRef.current;
    if (!u) return;
    const xs = u.data[0] as number[];
    if (!xs || !xs.length) return;
    const sx = u.scales.x;
    if (sx.min == null || sx.max == null) return;
    // Snap the visible window to whole steps that actually fall inside it.
    const minStep = Math.ceil(sx.min);
    const maxStep = Math.floor(sx.max);
    if (minStep > maxStep) return;
    const count = xs.filter(x => x >= minStep && x <= maxStep).length;

    openConfirm({
      title: 'Delete Selected Range',
      message: `Permanently delete steps ${minStep.toLocaleString()}–${maxStep.toLocaleString()} (${count.toLocaleString()} plotted points) from the loss log for all metrics? This cannot be undone.`,
      type: 'danger',
      confirmText: 'Delete',
      onConfirm: async () => {
        setDeleting(true);
        try {
          await deleteRange(minStep, maxStep);
          // Zoom out: clear the zoom flag first so the data-update effect
          // refits the x-scale to the remaining data instead of holding the
          // old window.
          isZoomedRef.current = false;
          setIsZoomed(false);
          handleResetZoom();
        } catch (e) {
          console.error('Error deleting loss range:', e);
        } finally {
          setDeleting(false);
        }
      },
    });
  }, [deleteRange, handleResetZoom]);

  const totalPoints = built.data[0]?.length ?? 0;

  return (
    <div className="bg-gray-900 rounded-xl shadow-lg overflow-hidden border border-gray-800 flex flex-col h-full">
      <div className="bg-gray-800 px-4 py-3 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-blue-400" />
            <h2 className="text-gray-100 text-sm font-medium">Loss graph</h2>
            <span className="text-xs text-gray-400">
            {status === 'loading' && 'Loading...'}
            {status === 'refreshing' && 'Refreshing...'}
            {status === 'error' && 'Error'}
            {status === 'success' && hasData && `${totalPoints.toLocaleString()} steps`}
            {status === 'success' && !hasData && 'No data yet'}
          </span>
        </div>

        <button
          type="button"
          onClick={refreshLoss}
          className="px-3 py-1 rounded-md text-xs bg-gray-700/60 hover:bg-gray-700 text-gray-200 border border-gray-700"
        >
          Refresh
        </button>
      </div>

      {/* Chart */}
      <div className="px-4 pt-4 pb-4 flex-1 min-h-0 flex flex-col">
        <div
          className="bg-gray-950 rounded-lg border border-gray-800 relative select-none flex-1 min-h-0"
          style={{ minHeight: 240 }}
        >
          {!hasData ? (
            <div className="absolute inset-0 flex items-center justify-center text-sm text-gray-400">
              {status === 'error' ? 'Failed to load loss logs.' : 'Waiting for loss points...'}
            </div>
          ) : (
            <>
              {isZoomed && (
                <div className="absolute top-2 right-2 z-10 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleDeleteSelectedRange}
                    disabled={deleting}
                    className="px-2 py-1 rounded text-xs bg-red-600/80 hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed text-white border border-red-500/50"
                  >
                    {deleting ? 'Deleting...' : 'Delete Selected Range'}
                  </button>
                  <button
                    type="button"
                    onClick={handleResetZoom}
                    className="px-2 py-1 rounded text-xs bg-blue-600/80 hover:bg-blue-600 text-white border border-blue-500/50"
                  >
                    Reset zoom
                  </button>
                </div>
              )}
              <div ref={chartHostRef} className="absolute top-0 left-0 right-0 bottom-2 overflow-hidden">
                <div ref={containerRef} />
              </div>
            </>
          )}
        </div>
      </div>

      {/* Controls */}
      <div className="px-4 pb-2 shrink-0">
        <div className="bg-gray-950 border border-gray-800 rounded-lg mb-3">
          <button
            type="button"
            onClick={() => setSeriesPanelOpen(value => !value)}
            className="flex w-full items-center justify-between gap-3 p-3 text-left"
            aria-expanded={seriesPanelOpen}
            aria-controls="loss-series-panel"
          >
            <span className="flex min-w-0 items-center gap-2">
              <span className="text-xs text-gray-400">Series</span>
              <span className="truncate text-xs text-gray-300">
                {activeKeys.length} of {visibleLossKeys.length} shown
              </span>
              <span className="hidden truncate text-[11px] text-gray-500 sm:inline">
                {activeKeys
                  .slice(0, 4)
                  .map(key => keyLabelByKey[key] ?? key)
                  .join(', ')}
                {activeKeys.length > 4 ? ` +${activeKeys.length - 4}` : ''}
              </span>
            </span>
            <ChevronDown
              className={classNames(
                'h-4 w-4 shrink-0 text-gray-400 transition-transform',
                seriesPanelOpen ? 'rotate-180' : '',
              )}
            />
          </button>

          {seriesPanelOpen && (
            <div id="loss-series-panel" className="border-t border-gray-800 p-3">
              {visibleLossKeys.length === 0 ? (
                <div className="text-sm text-gray-400">No loss keys found yet.</div>
              ) : (
                <>
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <span className="text-[11px] text-gray-500">Click a series to show or hide it.</span>
                    <div className="flex gap-1.5">
                      <button
                        type="button"
                        onClick={() =>
                          setEnabled(prev => {
                            const next = { ...prev };
                            for (const key of visibleLossKeys) next[key] = true;
                            return next;
                          })
                        }
                        className="rounded border border-gray-700 px-2 py-0.5 text-[11px] text-gray-300 hover:bg-gray-800"
                      >
                        All
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setEnabled(prev => {
                            const next = { ...prev };
                            for (const key of visibleLossKeys) next[key] = false;
                            return next;
                          })
                        }
                        className="rounded border border-gray-700 px-2 py-0.5 text-[11px] text-gray-300 hover:bg-gray-800"
                      >
                        None
                      </button>
                    </div>
                  </div>
                  <div className="grid max-h-64 grid-cols-1 gap-1.5 overflow-y-auto pr-1 sm:grid-cols-2 xl:grid-cols-3">
                    {visibleLossKeys.map(key => {
                      const selected = isSeriesSelected(key);
                      const color = colorByKey[key] ?? seriesColor(0);
                      return (
                        <button
                          key={key}
                          type="button"
                          onClick={() => setEnabled(prev => ({ ...prev, [key]: !isSeriesSelected(key) }))}
                          className={classNames(
                            'flex min-w-0 items-center gap-2 rounded-md border px-2.5 py-1.5 text-left text-xs transition-colors',
                            selected
                              ? 'bg-gray-800/70 text-gray-100 border-gray-600'
                              : 'bg-gray-900/40 text-gray-500 border-gray-800 hover:text-gray-300 hover:border-gray-700',
                          )}
                          style={
                            selected
                              ? { borderColor: withAlpha(color, 0.65), backgroundColor: withAlpha(color, 0.12) }
                              : undefined
                          }
                          aria-pressed={selected}
                          title={key}
                        >
                          <span
                            className={classNames(
                              'h-2.5 w-2.5 shrink-0 rounded-full border',
                              selected ? 'border-transparent' : 'bg-transparent',
                            )}
                            style={{ backgroundColor: selected ? color : 'transparent', borderColor: color }}
                          />
                          <span className="min-w-0 flex-1 truncate">{keyLabelByKey[key] ?? key}</span>
                          {selected && <Check className="h-3.5 w-3.5 shrink-0" style={{ color }} />}
                        </button>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="bg-gray-950 border border-gray-800 rounded-lg p-3 md:col-span-2">
            <label className="block text-xs text-gray-400 mb-2">Display</label>
            <div className="flex flex-wrap gap-2">
              <ToggleButton checked={smoothingMode === 'ema'} onClick={() => setSmoothingMode('ema')} label="EMA" />
              <ToggleButton
                checked={smoothingMode === 'ma'}
                onClick={() => setSmoothingMode('ma')}
                label="Moving avg"
              />
              {smoothingMode === 'ema' ? (
                <ToggleButton checked={showTrend} onClick={() => setShowTrend(v => !v)} label="Trend" />
              ) : (
                <>
                  <ToggleButton
                    checked={showRawPoints}
                    onClick={() => setShowRawPoints(v => (showMovingAverage ? !v : true))}
                    label="Raw points"
                  />
                  <ToggleButton
                    checked={showMovingAverage}
                    onClick={() => setShowMovingAverage(v => (showRawPoints ? !v : true))}
                    label="MA line"
                  />
                  <ToggleButton
                    checked={showConfidenceBand && showMovingAverage}
                    onClick={() => setShowConfidenceBand(v => !v)}
                    label="95% CI"
                    disabled={!showMovingAverage}
                  />
                  <ToggleButton
                    checked={showObservationDots && showMovingAverage}
                    onClick={() => setShowObservationDots(v => !v)}
                    label="Observation dots"
                    disabled={!showMovingAverage}
                  />
                </>
              )}
              <ToggleButton checked={showRawSeries} onClick={() => setShowRawSeries(v => !v)} label="Show raw series" />
              <ToggleButton checked={showAuxSeries} onClick={() => setShowAuxSeries(v => !v)} label="Show aux series" />
              <ToggleButton checked={useLogScale} onClick={() => setUseLogScale(v => !v)} label="Log Y" />
              <ToggleButton checked={sharedAxis} onClick={() => setSharedAxis(v => !v)} label="Shared Y axis" />
              <ToggleButton
                checked={followTail}
                onClick={() => setFollowTail(v => !v)}
                label="Follow latest"
                title="While a selected range reaches the newest point, grow its right edge as new observations arrive."
              />
              <ToggleButton checked={clipOutliers} onClick={() => setClipOutliers(v => !v)} label="Clip outliers" />
            </div>
          </div>

          <div className="bg-gray-950 border border-gray-800 rounded-lg p-3">
            {smoothingMode === 'ema' ? (
              <>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs text-gray-400">EMA smoothing</label>
                  <span className="text-xs text-gray-300">{emaSmoothing}%</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={emaSmoothing}
                  onChange={e => setEmaSmoothing(Number(e.target.value))}
                  className="w-full accent-blue-500"
                />
                <div className="mt-2 text-[11px] text-gray-500">
                  EMA is forward/backward (retrospective) with optional trend overlay. 95% CI bands are available in
                  Moving Average mode.
                </div>
              </>
            ) : (
              <>
                <div className="flex items-center justify-between gap-2 mb-1">
                  <label className="block text-xs text-gray-400">Moving average window</label>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="number"
                      min={MA_WINDOW_MIN}
                      max={MA_WINDOW_MAX}
                      value={maInput}
                      onChange={e => setMaInput(e.target.value)}
                      onBlur={commitMaInput}
                      onKeyDown={e => {
                        if (e.key === 'Enter') {
                          e.currentTarget.blur();
                        }
                      }}
                      className="w-20 rounded border border-gray-700 bg-gray-900 px-2 py-0.5 text-right text-xs text-gray-200 focus:border-transparent focus:ring-2 focus:ring-gray-600"
                      aria-label="Moving average window in points"
                    />
                    <span className="text-xs text-gray-300">pts</span>
                  </div>
                </div>
                <input
                  type="range"
                  min={0}
                  max={1000}
                  value={maWindowToSlider(maWindow)}
                  onChange={e => setMaWindow(sliderToMaWindow(Number(e.target.value)))}
                  className="w-full accent-blue-500"
                  aria-label="Moving average window"
                />
                <div className="flex justify-between text-[10px] text-gray-500">
                  <span>{MA_WINDOW_MIN} pts</span>
                  <span>{MA_WINDOW_MAX.toLocaleString()} pts</span>
                </div>
                <div className="mt-1 text-[11px] text-gray-500">
                  Trailing MA over recent points. The line starts only once the window is full, so volatile early
                  steps no longer leak into it; a window wider than the run shrinks to half the run. 95% CI is the
                  standard error of the windowed mean, and observation dots mark where the series was actually
                  logged.
                </div>
              </>
            )}
          </div>

          <div className="bg-gray-950 border border-gray-800 rounded-lg p-3">
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs text-gray-400">Plot stride</label>
              <span className="text-xs text-gray-300">every {plotStride} pt</span>
            </div>
            <input
              type="range"
              min={1}
              max={20}
              value={plotStride}
              onChange={e => setPlotStride(Number(e.target.value))}
              className="w-full accent-blue-500"
            />
            <div className="mt-2 text-[11px] text-gray-500">UI downsample for huge runs.</div>
          </div>
        </div>
      </div>

      <style jsx global>{`
        .uplot,
        .uplot * {
          font-family: inherit;
        }
        .uplot .u-legend {
          color: rgba(255, 255, 255, 0.85);
          font-size: 12px;
          margin-top: 4px;
        }
        .uplot .u-legend th,
        .uplot .u-legend td {
          color: rgba(255, 255, 255, 0.85);
        }
        .uplot .u-legend .u-marker {
          border-radius: 2px;
        }
        .uplot .u-legend tr.u-ci-band,
        .uplot .u-legend tr.u-obs-dots {
          display: none;
        }
        .uplot .u-select {
          background: rgba(59, 130, 246, 0.15);
          border: 1px solid rgba(59, 130, 246, 0.4);
        }
      `}</style>
    </div>
  );
}

function ToggleButton({
  checked,
  onClick,
  label,
  disabled,
  title,
}: {
  checked: boolean;
  onClick: () => void;
  label: string;
  disabled?: boolean;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={[
        'px-3 py-1 rounded-md text-xs border transition-colors',
        checked
          ? 'bg-blue-500/10 text-blue-300 border-blue-500/30 hover:bg-blue-500/15'
          : 'bg-gray-900 text-gray-300 border-gray-800 hover:bg-gray-800/60',
        disabled ? 'opacity-40 cursor-not-allowed' : '',
      ].join(' ')}
      aria-pressed={checked}
    >
      {label}
    </button>
  );
}
