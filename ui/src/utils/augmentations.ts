// Helpers for per-dataset albumentations config. The only runtime dependency is
// `yaml`, which lets the raw editor accept either YAML or JSON. The New Job UI
// and the node test runner both import this module directly.

import YAML from 'yaml';

export interface AugmentationEntry {
  method: string;
  params?: Record<string, unknown>;
}

export interface AugmentationValidation {
  entries: AugmentationEntry[];
  errors: string[];
  warnings: string[];
}

export interface AugmentationPreset {
  key: string;
  label: string;
  description: string;
  entries: AugmentationEntry[];
}

/**
 * Curated subset of the albumentations API that is useful for training data.
 * The trainer accepts any class on the installed albumentations version, so
 * this list is only used for suggestions and "unknown method" warnings.
 */
export const AUGMENTATION_METHODS: { name: string; group: string }[] = [
  // photometric
  { name: 'RandomBrightnessContrast', group: 'Photometric' },
  { name: 'HueSaturationValue', group: 'Photometric' },
  { name: 'ColorJitter', group: 'Photometric' },
  { name: 'RandomGamma', group: 'Photometric' },
  { name: 'RGBShift', group: 'Photometric' },
  { name: 'CLAHE', group: 'Photometric' },
  { name: 'Equalize', group: 'Photometric' },
  { name: 'Posterize', group: 'Photometric' },
  { name: 'Solarize', group: 'Photometric' },
  { name: 'ToGray', group: 'Photometric' },
  // blur / noise / compression
  { name: 'GaussianBlur', group: 'Blur / noise' },
  { name: 'Defocus', group: 'Blur / noise' },
  { name: 'MotionBlur', group: 'Blur / noise' },
  { name: 'MedianBlur', group: 'Blur / noise' },
  { name: 'GaussNoise', group: 'Blur / noise' },
  { name: 'ISONoise', group: 'Blur / noise' },
  { name: 'ImageCompression', group: 'Blur / noise' },
  { name: 'Downscale', group: 'Blur / noise' },
  // occlusion
  { name: 'CoarseDropout', group: 'Occlusion' },
  // geometric
  { name: 'HorizontalFlip', group: 'Geometric' },
  { name: 'VerticalFlip', group: 'Geometric' },
  { name: 'Rotate', group: 'Geometric' },
  { name: 'Affine', group: 'Geometric' },
  { name: 'Perspective', group: 'Geometric' },
  { name: 'ElasticTransform', group: 'Geometric' },
  { name: 'GridDistortion', group: 'Geometric' },
  { name: 'OpticalDistortion', group: 'Geometric' },
  { name: 'RandomResizedCrop', group: 'Geometric' },
];

export const AUGMENTATION_METHOD_NAMES = new Set(AUGMENTATION_METHODS.map(item => item.name));

/**
 * Ready-made lists. The de-artifact preset targets the failure modes of
 * synthetic training data: high-frequency texture, repeated patterns, and
 * unnaturally clean detail. Verified against albumentations 1.4.15.
 */
export const AUGMENTATION_PRESETS: AugmentationPreset[] = [
  {
    key: 'deartifact',
    label: 'De-artifact (synthetic)',
    description:
      'Downscales, recompresses, blurs, adds noise, and occludes to break up synthetic texture and patterns.',
    entries: [
      { method: 'Downscale', params: { scale_range: [0.5, 0.85], p: 0.35 } },
      { method: 'ImageCompression', params: { quality_range: [40, 85], p: 0.35 } },
      { method: 'GaussNoise', params: { var_limit: [5, 20], p: 0.25 } },
      { method: 'Defocus', params: { radius: [1, 3], p: 0.15 } },
      { method: 'GaussianBlur', params: { blur_limit: [3, 3], p: 0.2 } },
      {
        method: 'CoarseDropout',
        params: {
          num_holes_range: [1, 4],
          hole_height_range: [8, 16],
          hole_width_range: [8, 16],
          fill_value: 'random',
          p: 0.2,
        },
      },
      { method: 'ElasticTransform', params: { alpha: 1.0, sigma: 30, p: 0.15 } },
      { method: 'RandomBrightnessContrast', params: { brightness_limit: 0.1, contrast_limit: 0.1, p: 0.5 } },
      { method: 'HueSaturationValue', params: { hue_shift_limit: 5, sat_shift_limit: 8, val_shift_limit: 8, p: 0.4 } },
    ],
  },
  {
    key: 'photometric',
    label: 'Photometric',
    description: 'Tone and colour variation only. Does not remove texture.',
    entries: [
      { method: 'RandomBrightnessContrast', params: { brightness_limit: 0.15, contrast_limit: 0.15, p: 0.5 } },
      {
        method: 'HueSaturationValue',
        params: { hue_shift_limit: 5, sat_shift_limit: 10, val_shift_limit: 10, p: 0.5 },
      },
      { method: 'ImageCompression', params: { quality_range: [60, 95], p: 0.3 } },
      { method: 'GaussNoise', params: { var_limit: [5, 15], p: 0.2 } },
    ],
  },
  {
    key: 'geometric',
    label: 'Geometric',
    description: 'Mild warps and shifts. Spatial ops are replayed onto control images when replay_transforms is on.',
    entries: [
      { method: 'Affine', params: { scale: [0.95, 1.05], translate_percent: [0.02, 0.02], rotate: [-5, 5], p: 0.3 } },
      { method: 'Perspective', params: { scale: [0.02, 0.05], p: 0.2 } },
      { method: 'ElasticTransform', params: { alpha: 1.0, sigma: 30, p: 0.1 } },
      { method: 'GridDistortion', params: { num_steps: 5, distort_limit: 0.1, p: 0.1 } },
    ],
  },
];

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isFiniteNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

/**
 * Validate a raw `datasets[].augmentations` value.
 *
 * Errors mean the trainer would fail (or the entry would do nothing useful).
 * Warnings are advisory: unknown method names may still exist in the installed
 * albumentations version.
 */
export function validateAugmentations(value: unknown): AugmentationValidation {
  const errors: string[] = [];
  const warnings: string[] = [];
  const entries: AugmentationEntry[] = [];

  if (value === undefined || value === null) {
    return { entries, errors, warnings };
  }

  if (!Array.isArray(value)) {
    errors.push('Augmentations must be a list of { method, params } entries.');
    return { entries, errors, warnings };
  }

  value.forEach((raw, index) => {
    const position = `Entry ${index + 1}`;
    if (!isPlainObject(raw)) {
      errors.push(`${position} must be an object with a method and optional params.`);
      return;
    }

    const method = raw.method;
    if (typeof method !== 'string' || method.trim() === '') {
      errors.push(`${position} is missing a method name.`);
      return;
    }

    if (raw.params !== undefined && raw.params !== null && !isPlainObject(raw.params)) {
      errors.push(`${position} (${method}) params must be a JSON object.`);
      return;
    }

    const params = isPlainObject(raw.params) ? raw.params : {};
    if (params.p !== undefined && (!isFiniteNumber(params.p) || params.p < 0 || params.p > 1)) {
      errors.push(`${position} (${method}) p must be a number between 0 and 1.`);
      return;
    }

    if (!AUGMENTATION_METHOD_NAMES.has(method)) {
      warnings.push(
        `${method} is not in the curated list. Make sure it exists in the installed albumentations version.`,
      );
    }

    entries.push({ method, params });
  });

  return { entries, errors, warnings };
}

/** Parse JSON first so JSON syntax errors stay readable, then fall back to YAML. */
function parseJsonOrYaml(text: string): { value?: unknown; error?: string } {
  try {
    return { value: JSON.parse(text) };
  } catch {
    try {
      return { value: YAML.parse(text) };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'invalid YAML/JSON';
      return { error: message };
    }
  }
}

/** Parse the raw textarea form of the augmentation list. Accepts YAML or JSON. */
export function parseAugmentationsText(text: string): { entries: AugmentationEntry[]; error?: string } {
  const trimmed = text.trim();
  if (trimmed === '') {
    return { entries: [] };
  }

  const parsed = parseJsonOrYaml(trimmed);
  if (parsed.error !== undefined) {
    return { entries: [], error: `Invalid YAML or JSON: ${parsed.error}` };
  }

  // Accept the exact snippet from a config file as well as a bare list.
  let raw = parsed.value;
  if (isPlainObject(raw) && 'augmentations' in raw) {
    raw = raw.augmentations;
  }

  const validation = validateAugmentations(raw);
  if (validation.errors.length > 0) {
    return { entries: [], error: validation.errors[0] };
  }

  return { entries: validation.entries };
}

/** Parse the per-transform params textarea. Accepts a YAML or JSON mapping. */
export function parseAugmentationParamsText(text: string): { params?: Record<string, unknown>; error?: string } {
  const trimmed = text.trim();
  if (trimmed === '') {
    return { params: {} };
  }

  const parsed = parseJsonOrYaml(trimmed);
  if (parsed.error !== undefined) {
    return { error: `Invalid YAML or JSON: ${parsed.error}` };
  }
  if (!isPlainObject(parsed.value)) {
    return { error: 'Parameters must be a YAML/JSON mapping (object).' };
  }

  return { params: parsed.value };
}

export function formatAugmentations(entries: AugmentationEntry[] | null | undefined): string {
  return JSON.stringify(entries ?? [], null, 2);
}

export function formatAugmentationParams(params: Record<string, unknown> | null | undefined): string {
  return JSON.stringify(params ?? {});
}

/**
 * Split the shared probability `p` from the method-specific parameters so the
 * editor can show p as a normal control and keep the params textarea focused.
 */
export function splitAugmentationParams(params: Record<string, unknown> | null | undefined): {
  p: number | null;
  rest: Record<string, unknown>;
} {
  const rest = isPlainObject(params) ? { ...params } : {};
  const rawP = rest.p;
  delete rest.p;
  return { p: isFiniteNumber(rawP) ? rawP : null, rest };
}

/** Rebuild a params object with p placed last, matching the YAML examples. */
export function mergeAugmentationParams(
  rest: Record<string, unknown> | null | undefined,
  p: number | null | undefined,
): Record<string, unknown> {
  const params = isPlainObject(rest) ? { ...rest } : {};
  delete params.p;
  if (p !== null && p !== undefined) {
    params.p = p;
  }
  return params;
}

/** Deep copy so preset edits never mutate the module-level preset objects. */
export function cloneAugmentationEntries(entries: AugmentationEntry[]): AugmentationEntry[] {
  return entries.map(entry => ({
    method: entry.method,
    params: JSON.parse(JSON.stringify(entry.params ?? {})),
  }));
}
