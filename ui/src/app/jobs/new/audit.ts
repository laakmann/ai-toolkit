import type { DatasetConfig, JobConfig, TrainConfig } from '@/types';

export type AuditSeverity = 'error' | 'warning' | 'info';

/** Minimal structural shape of the parts of ModelArch the audit needs. */
export interface AuditArch {
  name?: string;
  group?: string;
  disableSections?: string[];
  additionalSections?: string[];
  isVideoModel?: boolean;
}

export interface AuditIssue {
  id: string;
  /** Config path shown in the UI, e.g. datasets[0].timestep_weights */
  path: string;
  severity: AuditSeverity;
  /** Grouping label, e.g. Training or Dataset 1 */
  section: string;
  /** DOM target used by the Jump action */
  target: string;
  title: string;
  message: string;
}

export interface AuditContext {
  config: JobConfig;
  arch?: AuditArch | null;
}

const TIMESTEP_TYPES = [
  'linear',
  'sigmoid',
  'shift',
  'flux_shift',
  'lumina2_shift',
  'lognorm_blend',
  'next_sample',
  'weighted',
  'one_step',
  'two_step',
  'four_step',
  'eight_step',
] as const;

const FIXED_STEP_TYPES = new Set(['one_step', 'two_step', 'four_step', 'eight_step']);

/** Types that do not use the normal [min, max] timestep window. */
const RANGE_IGNORING_TYPES = new Set(['one_step', 'two_step', 'four_step', 'eight_step', 'next_sample']);

interface AuxLossRule {
  key: string;
  label: string;
  weightKey: keyof DatasetConfig;
  minKey?: keyof DatasetConfig;
  maxKey?: keyof DatasetConfig;
  minCosKey?: keyof DatasetConfig;
  /** Global block that must exist for a dataset override to have any effect. */
  globalBlock?: 'face_id' | 'depth_consistency' | 'train';
  globalWeightKey?: string;
}

const AUX_LOSSES: AuxLossRule[] = [
  {
    key: 'depth',
    label: 'Depth consistency',
    weightKey: 'depth_loss_weight',
    minKey: 'depth_loss_min_t',
    maxKey: 'depth_loss_max_t',
    globalBlock: 'depth_consistency',
    globalWeightKey: 'loss_weight',
  },
  {
    key: 'identity',
    label: 'Identity',
    weightKey: 'identity_loss_weight',
    minKey: 'identity_loss_min_t',
    maxKey: 'identity_loss_max_t',
    minCosKey: 'identity_loss_min_cos',
    globalBlock: 'face_id',
    globalWeightKey: 'identity_loss_weight',
  },
  {
    key: 'landmark',
    label: 'Landmark',
    weightKey: 'landmark_loss_weight',
    globalBlock: 'face_id',
    globalWeightKey: 'landmark_loss_weight',
  },
  {
    key: 'body_proportion',
    label: 'Body proportion',
    weightKey: 'body_proportion_loss_weight',
    minKey: 'body_proportion_loss_min_t',
    maxKey: 'body_proportion_loss_max_t',
    globalBlock: 'face_id',
    globalWeightKey: 'body_proportion_loss_weight',
  },
  {
    key: 'body_shape',
    label: 'Body shape',
    weightKey: 'body_shape_loss_weight',
    minKey: 'body_shape_loss_min_t',
    maxKey: 'body_shape_loss_max_t',
    globalBlock: 'face_id',
    globalWeightKey: 'body_shape_loss_weight',
  },
  {
    key: 'normal',
    label: 'Normal map',
    weightKey: 'normal_loss_weight',
    minKey: 'normal_loss_min_t',
    maxKey: 'normal_loss_max_t',
    globalBlock: 'face_id',
    globalWeightKey: 'normal_loss_weight',
  },
  {
    key: 'vae_anchor',
    label: 'VAE anchor',
    weightKey: 'vae_anchor_loss_weight',
    minKey: 'vae_anchor_loss_min_t',
    maxKey: 'vae_anchor_loss_max_t',
    globalBlock: 'face_id',
    globalWeightKey: 'vae_anchor_loss_weight',
  },
  {
    key: 'latent_perceptual',
    label: 'Latent perceptual',
    weightKey: 'latent_perceptual_loss_weight',
    minKey: 'latent_perceptual_loss_min_t',
    maxKey: 'latent_perceptual_loss_max_t',
    globalBlock: 'train',
    globalWeightKey: 'latent_perceptual_loss_weight',
  },
];

const hasValue = (obj: any, key: PropertyKey): boolean => {
  if (obj == null) return false;
  const value = obj[key];
  return value !== undefined && value !== null && value !== '';
};

const asNumber = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) return Number(value);
  return null;
};

const datasetLabel = (dataset: DatasetConfig, index: number): string => {
  const raw = dataset?.folder_path || (dataset as any)?.dataset_path;
  if (!raw) return `Dataset ${index + 1}`;
  const parts = String(raw).replace(/\\/g, '/').split('/').filter(Boolean);
  return `Dataset ${index + 1} (${parts[parts.length - 1] || raw})`;
};

export function auditJobConfig({ config, arch }: AuditContext): AuditIssue[] {
  const issues: AuditIssue[] = [];
  const process = config?.config?.process?.[0];
  if (!process) return issues;

  const train: TrainConfig = process.train;
  const datasets: DatasetConfig[] = process.datasets || [];
  const add = (issue: AuditIssue) => issues.push(issue);

  const globalType = String(train?.timestep_type || '');
  const numTrainTimesteps = asNumber((train as any)?.num_train_timesteps) ?? 1000;

  const effectiveType = (dataset: DatasetConfig): string => {
    return String(dataset?.timestep_type || globalType || '');
  };

  // ---------------------------------------------------------
  // Global timestep rules
  // ---------------------------------------------------------
  if (globalType && !TIMESTEP_TYPES.includes(globalType as any)) {
    add({
      id: 'train.timestep_type.invalid',
      path: 'train.timestep_type',
      severity: 'error',
      section: 'Training',
      target: 'training',
      title: 'Unknown timestep type',
      message: `"${globalType}" is not a recognized timestep type.`,
    });
  }

  if (numTrainTimesteps <= 0) {
    add({
      id: 'train.num_train_timesteps.invalid',
      path: 'train.num_train_timesteps',
      severity: 'error',
      section: 'Training',
      target: 'training',
      title: 'Invalid schedule length',
      message: 'num_train_timesteps must be greater than zero.',
    });
  }

  if (train?.timestep_type === 'weighted' && train?.noise_scheduler !== 'flowmatch') {
    add({
      id: 'train.timestep_type.weighted.non_flowmatch',
      path: 'train.timestep_type',
      severity: 'warning',
      section: 'Training',
      target: 'training',
      title: 'Weighted timesteps need flow matching',
      message:
        'The built-in "weighted" loss curve is only applied to flow-matching models. It will be ignored with this noise scheduler.',
    });
  }

  if (train?.timestep_type === 'lognorm_blend' && train?.noise_scheduler !== 'flowmatch') {
    add({
      id: 'train.timestep_type.lognorm_non_flowmatch',
      path: 'train.timestep_type',
      severity: 'warning',
      section: 'Training',
      target: 'training',
      title: 'Lognorm blend needs flow matching',
      message:
        'lognorm_blend is only used by the custom flow-match sampler. It will be ignored with this noise scheduler.',
    });
  }

  if (train?.content_or_style && train.content_or_style !== 'balanced' && RANGE_IGNORING_TYPES.has(globalType)) {
    add({
      id: 'train.content_or_style.ignored',
      path: 'train.content_or_style',
      severity: 'warning',
      section: 'Training',
      target: 'training',
      title: 'Timestep bias is unused',
      message: `Timestep Bias is ignored when Timestep Type is "${globalType}".`,
    });
  }

  // ---------------------------------------------------------
  // Per-dataset timestep rules
  // ---------------------------------------------------------
  datasets.forEach((dataset, index) => {
    const label = datasetLabel(dataset, index);
    const type = effectiveType(dataset);
    const target = `dataset-${index}-timestep`;
    const rangeOverride =
      hasValue(dataset, 'timestep_type') ||
      hasValue(dataset, 'min_denoising_steps') ||
      hasValue(dataset, 'max_denoising_steps');

    if (hasValue(dataset, 'timestep_type') && !TIMESTEP_TYPES.includes(String(dataset.timestep_type) as any)) {
      add({
        id: `dataset.${index}.timestep_type.invalid`,
        path: `datasets[${index}].timestep_type`,
        severity: 'error',
        section: label,
        target,
        title: 'Unknown timestep type',
        message: `"${dataset.timestep_type}" is not a recognized timestep type.`,
      });
    }

    const min = asNumber(dataset.min_denoising_steps);
    const max = asNumber(dataset.max_denoising_steps);
    if (min !== null && max !== null && min > max) {
      add({
        id: `dataset.${index}.timestep_range.inverted`,
        path: `datasets[${index}].min_denoising_steps`,
        severity: 'error',
        section: label,
        target,
        title: 'Timestep range is inverted',
        message: `min_denoising_steps (${min}) is greater than max_denoising_steps (${max}).`,
      });
    } else if (min !== null && max !== null && min === max) {
      add({
        id: `dataset.${index}.timestep_range.single`,
        path: `datasets[${index}].min_denoising_steps`,
        severity: 'warning',
        section: label,
        target,
        title: 'Only one timestep will be sampled',
        message:
          'min_denoising_steps and max_denoising_steps are equal, so every batch item uses the same noise level.',
      });
    }

    if (rangeOverride && FIXED_STEP_TYPES.has(type)) {
      add({
        id: `dataset.${index}.timestep_range.ignored`,
        path: `datasets[${index}].min_denoising_steps`,
        severity: 'warning',
        section: label,
        target,
        title: 'Timestep range is unused',
        message: `The fixed "${type}" timestep type does not use the min/max denoising range.`,
      });
    }

    if (rangeOverride && datasets.length > 1 && asNumber(train?.batch_size) !== 1) {
      add({
        id: `dataset.${index}.timestep_range.mixed_batch`,
        path: `datasets[${index}].timestep_type`,
        severity: 'error',
        section: label,
        target,
        title: 'Dataset timestep override needs a homogeneous batch',
        message:
          'Dataset-level timestep type/range overrides require batch_size 1 or a batch containing only this dataset. Timestep weights are per-sample and do not have this restriction.',
      });
    }

    const weights = dataset.timestep_weights;
    if (weights != null) {
      if (!Array.isArray(weights) || weights.length === 0) {
        add({
          id: `dataset.${index}.timestep_weights.empty`,
          path: `datasets[${index}].timestep_weights`,
          severity: 'error',
          section: label,
          target,
          title: 'Timestep weights are empty',
          message: 'Provide at least one non-negative weight, for example 10, 4, 4, 1, 0.',
        });
      } else {
        const values = weights.map(v => asNumber(v));
        const invalid = values.some(v => v === null || v < 0);
        if (invalid) {
          add({
            id: `dataset.${index}.timestep_weights.invalid`,
            path: `datasets[${index}].timestep_weights`,
            severity: 'error',
            section: label,
            target,
            title: 'Invalid timestep weights',
            message: 'Timestep weights must be finite, non-negative numbers.',
          });
        } else {
          const nums = values as number[];
          if (!nums.some(v => v > 0)) {
            add({
              id: `dataset.${index}.timestep_weights.zero`,
              path: `datasets[${index}].timestep_weights`,
              severity: 'error',
              section: label,
              target,
              title: 'All timestep weights are zero',
              message: 'At least one bucket must have a positive weight.',
            });
          } else if (nums.every(v => v === nums[0])) {
            add({
              id: `dataset.${index}.timestep_weights.uniform`,
              path: `datasets[${index}].timestep_weights`,
              severity: 'info',
              section: label,
              target,
              title: 'Timestep weights are uniform',
              message: 'All buckets have the same weight, so this is equivalent to the normal sampler.',
            });
          }

          if (FIXED_STEP_TYPES.has(type)) {
            add({
              id: `dataset.${index}.timestep_weights.fixed_steps`,
              path: `datasets[${index}].timestep_weights`,
              severity: 'warning',
              section: label,
              target,
              title: 'Timestep weights are ignored',
              message: `The fixed "${type}" timestep type selects its own steps, so timestep weights are ignored.`,
            });
          }

          const scheduleLength = type === 'next_sample' ? 8 : numTrainTimesteps;
          if (scheduleLength > 0 && nums.length > scheduleLength) {
            add({
              id: `dataset.${index}.timestep_weights.too_many`,
              path: `datasets[${index}].timestep_weights`,
              severity: 'warning',
              section: label,
              target,
              title: 'More weight buckets than timesteps',
              message: `There are ${nums.length} weights but the active schedule has about ${scheduleLength} timesteps. Empty buckets are ignored.`,
            });
          }
        }
      }

      if ((asNumber(train?.first_timestep_chance) ?? 0) > 0) {
        add({
          id: `dataset.${index}.timestep_weights.first_chance`,
          path: `datasets[${index}].timestep_weights`,
          severity: 'info',
          section: label,
          target,
          title: 'First-step chance overrides weights',
          message:
            'first_timestep_chance can force some samples to the noisiest step, bypassing these weights for those samples.',
        });
      }
    }
  });

  // ---------------------------------------------------------
  // Auxiliary loss rules
  // ---------------------------------------------------------
  const block = (name: 'face_id' | 'depth_consistency' | 'train') => {
    if (name === 'train') return train as any;
    return (process as any)[name];
  };

  const globalDepthWeight = asNumber((process as any)?.depth_consistency?.loss_weight) ?? 0;
  let anyDepthWeight = globalDepthWeight > 0;
  datasets.forEach(ds => {
    const weight = asNumber(ds.depth_loss_weight);
    if (weight !== null && weight > 0) anyDepthWeight = true;
  });

  const checkAuxRange = (index: number, label: string, target: string, rule: AuxLossRule) => {
    const min = rule.minKey ? asNumber((datasets[index] as any)[rule.minKey]) : null;
    const max = rule.maxKey ? asNumber((datasets[index] as any)[rule.maxKey]) : null;
    if (min !== null && max !== null && min > max) {
      add({
        id: `dataset.${index}.${rule.key}.range_inverted`,
        path: `datasets[${index}].${String(rule.minKey)}`,
        severity: 'error',
        section: label,
        target,
        title: `${rule.label} range is inverted`,
        message: `${String(rule.minKey)} (${min}) is greater than ${String(rule.maxKey)} (${max}).`,
      });
    }
  };

  datasets.forEach((dataset, index) => {
    const label = datasetLabel(dataset, index);
    const target = `dataset-${index}-aux`;

    if (hasValue(dataset, 'diffusion_loss_weight')) {
      add({
        id: `dataset.${index}.diffusion_loss_weight.unused`,
        path: `datasets[${index}].diffusion_loss_weight`,
        severity: 'info',
        section: label,
        target,
        title: 'Diffusion loss weight is unused',
        message:
          'The trainer currently always uses a diffusion loss multiplier of 1.0 unless loss_split gates the step; diffusion_loss_weight is not read.',
      });
    }

    AUX_LOSSES.forEach(rule => {
      const weight = asNumber((dataset as any)[rule.weightKey]);
      const hasMin = rule.minKey ? hasValue(dataset, rule.minKey) : false;
      const hasMax = rule.maxKey ? hasValue(dataset, rule.maxKey) : false;
      const hasMinCos = rule.minCosKey ? hasValue(dataset, rule.minCosKey) : false;
      const hasRange = hasMin || hasMax || hasMinCos;

      if (weight !== null && weight < 0) {
        add({
          id: `dataset.${index}.${rule.key}.negative`,
          path: `datasets[${index}].${String(rule.weightKey)}`,
          severity: 'error',
          section: label,
          target,
          title: `${rule.label} weight is negative`,
          message: 'Loss weights must be zero or greater.',
        });
      }

      if (weight === 0 && hasRange) {
        add({
          id: `dataset.${index}.${rule.key}.unused_range`,
          path: `datasets[${index}].${String(rule.minKey || rule.weightKey)}`,
          severity: 'warning',
          section: label,
          target,
          title: `${rule.label} range is unused`,
          message: 'A min/max/min_cos value is set while the loss weight is zero, so it has no effect.',
        });
      }

      if (weight !== null && weight > 0) {
        if (rule.globalBlock === 'train') {
          const globalWeight = asNumber((train as any)?.[rule.globalWeightKey || '']);
          if (globalWeight === null || globalWeight <= 0) {
            add({
              id: `dataset.${index}.${rule.key}.global_gate`,
              path: `datasets[${index}].${String(rule.weightKey)}`,
              severity: 'warning',
              section: label,
              target,
              title: `${rule.label} is gated off`,
              message:
                'train.latent_perceptual_loss_weight must be greater than zero before per-dataset latent perceptual weights can apply.',
            });
          }
        } else if (rule.globalBlock) {
          const globalBlock = (process as any)[rule.globalBlock];
          if (globalBlock == null) {
            add({
              id: `dataset.${index}.${rule.key}.missing_block`,
              path: `datasets[${index}].${String(rule.weightKey)}`,
              severity: 'warning',
              section: label,
              target,
              title: `${rule.label} has no global setup`,
              message: `Set a ${rule.globalBlock} block in the advanced config or the loss will be skipped.`,
            });
          }
        }
      }

      if (hasRange) checkAuxRange(index, label, target, rule);
    });

    if (hasValue(dataset, 'face_suppression_weight')) {
      const w = asNumber(dataset.face_suppression_weight);
      if (w !== null && w < 0) {
        add({
          id: `dataset.${index}.face_suppression.negative`,
          path: `datasets[${index}].face_suppression_weight`,
          severity: 'error',
          section: label,
          target,
          title: 'Face suppression weight is negative',
          message: 'Loss weights must be zero or greater.',
        });
      }
      if (w === 0 && (hasValue(dataset, 'face_suppression_expand') || hasValue(dataset, 'face_suppression_soft'))) {
        add({
          id: `dataset.${index}.face_suppression.unused`,
          path: `datasets[${index}].face_suppression_weight`,
          severity: 'warning',
          section: label,
          target,
          title: 'Face suppression options are unused',
          message: 'Expand/soft settings have no effect while face_suppression_weight is zero.',
        });
      }
      if (w !== null && w > 0 && (process as any).face_id == null) {
        add({
          id: `dataset.${index}.face_suppression.missing_block`,
          path: `datasets[${index}].face_suppression_weight`,
          severity: 'warning',
          section: label,
          target,
          title: 'Face suppression has no global setup',
          message: 'Set a face_id block in the advanced config or face suppression will be skipped.',
        });
      }
    }

    if (dataset.perceptual_restrict_to_body === true && !(process as any)?.subject_mask?.enabled) {
      add({
        id: `dataset.${index}.perceptual_restrict_to_body.no_mask`,
        path: `datasets[${index}].perceptual_restrict_to_body`,
        severity: 'warning',
        section: label,
        target,
        title: 'Subject masks are disabled',
        message: 'perceptual_restrict_to_body has no effect unless subject_mask.enabled is true.',
      });
    }

    if (hasValue(dataset, 'loss_split') && !anyDepthWeight) {
      add({
        id: `dataset.${index}.loss_split.unused`,
        path: `datasets[${index}].loss_split`,
        severity: 'warning',
        section: label,
        target,
        title: 'Loss split is unused',
        message: 'loss_split only has an effect when a depth consistency loss weight is active.',
      });
    }
  });

  // Global auxiliary blocks
  const checkGlobalRange = (
    sectionName: string,
    path: string,
    target: string,
    weight: number | null,
    min: number | null,
    max: number | null,
    label: string,
    hasActiveOverride = false,
  ) => {
    if (min !== null && max !== null && min > max) {
      add({
        id: `global.${sectionName}.range_inverted`,
        path,
        severity: 'error',
        section: 'Auxiliary Losses',
        target,
        title: `${label} range is inverted`,
        message: 'The minimum timestep is greater than the maximum timestep.',
      });
    }
    if (weight === 0 && !hasActiveOverride && (min !== null || max !== null)) {
      add({
        id: `global.${sectionName}.unused_range`,
        path,
        severity: 'warning',
        section: 'Auxiliary Losses',
        target,
        title: `${label} range is unused`,
        message: 'The loss weight is zero, so its min/max timestep range has no effect.',
      });
    }
  };

  const depthCfg = (process as any)?.depth_consistency;
  if (depthCfg != null) {
    checkGlobalRange(
      'depth_consistency',
      'depth_consistency.loss_weight',
      'aux',
      asNumber(depthCfg.loss_weight),
      asNumber(depthCfg.loss_min_t),
      asNumber(depthCfg.loss_max_t),
      'Depth consistency',
      anyDepthWeight,
    );
  }

  const faceCfg = (process as any)?.face_id;
  if (faceCfg != null) {
    AUX_LOSSES.filter(r => r.globalBlock === 'face_id').forEach(rule => {
      const hasOverride = datasets.some(dataset => (asNumber((dataset as any)[rule.weightKey]) ?? 0) > 0);
      checkGlobalRange(
        `face_id.${rule.key}`,
        `face_id.${rule.globalWeightKey || ''}`,
        'aux',
        asNumber(faceCfg[rule.globalWeightKey || '']),
        rule.minKey ? asNumber(faceCfg[rule.minKey as string]) : null,
        rule.maxKey ? asNumber(faceCfg[rule.maxKey as string]) : null,
        rule.label,
        hasOverride,
      );
    });
  }

  checkGlobalRange(
    'train.latent_perceptual',
    'train.latent_perceptual_loss_weight',
    'aux',
    asNumber(train?.latent_perceptual_loss_weight),
    asNumber(train?.latent_perceptual_loss_min_t),
    asNumber(train?.latent_perceptual_loss_max_t),
    'Latent perceptual',
  );

  if (hasValue(train, 'loss_split') && !anyDepthWeight) {
    add({
      id: 'train.loss_split.unused',
      path: 'train.loss_split',
      severity: 'warning',
      section: 'Auxiliary Losses',
      target: 'aux',
      title: 'Loss split is unused',
      message: 'train.loss_split only has an effect when a depth consistency loss weight is active.',
    });
  }

  // ---------------------------------------------------------
  // General dataset / arch rules
  // ---------------------------------------------------------
  datasets.forEach((dataset, index) => {
    const label = datasetLabel(dataset, index);
    if (hasValue(dataset, 'batch_size') && dataset.buckets === false) {
      add({
        id: `dataset.${index}.batch_size.no_buckets`,
        path: `datasets[${index}].batch_size`,
        severity: 'error',
        section: label,
        target: `dataset-${index}`,
        title: 'Dataset batch size needs buckets',
        message: 'A per-dataset batch_size requires buckets to be enabled.',
      });
    }

    const hasAugmentations = Array.isArray(dataset.augmentations) && dataset.augmentations.length > 0;
    if (hasAugmentations && (dataset.cache_latents || dataset.cache_latents_to_disk)) {
      add({
        id: `dataset.${index}.augmentations.cache`,
        path: `datasets[${index}].cache_latents_to_disk`,
        severity: 'warning',
        section: label,
        target: `dataset-${index}`,
        title: 'Latent caching is disabled by augmentations',
        message:
          'The trainer turns caching off when augmentations are enabled, because augmented images cannot be cached.',
      });
    }

    if (arch && arch.group !== 'audio') {
      const audioFields = ['do_audio', 'audio_normalize', 'audio_preserve_pitch'] as const;
      if (audioFields.some(key => dataset[key] === true)) {
        add({
          id: `dataset.${index}.audio.unsupported`,
          path: `datasets[${index}].do_audio`,
          severity: 'warning',
          section: label,
          target: `dataset-${index}`,
          title: 'Audio options are unused',
          message: 'The selected model is not an audio model, so audio dataset options have no effect.',
        });
      }
    }

    if (arch && arch.group !== 'video') {
      if (dataset.do_i2v === true) {
        add({
          id: `dataset.${index}.i2v.unsupported`,
          path: `datasets[${index}].do_i2v`,
          severity: 'warning',
          section: label,
          target: `dataset-${index}`,
          title: 'I2V option is unused',
          message: 'The selected model is not a video model, so do_i2v has no effect.',
        });
      }
      if ((asNumber(dataset.num_frames) ?? 1) > 1) {
        add({
          id: `dataset.${index}.num_frames.unsupported`,
          path: `datasets[${index}].num_frames`,
          severity: 'warning',
          section: label,
          target: `dataset-${index}`,
          title: 'Video frame count is unused',
          message: 'The selected model is not a video model, so num_frames has no effect.',
        });
      }
    }

    if (
      dataset.auto_frame_count === true &&
      arch?.additionalSections &&
      !arch.additionalSections.includes('datasets.auto_frame_count')
    ) {
      add({
        id: `dataset.${index}.auto_frame_count.unsupported`,
        path: `datasets[${index}].auto_frame_count`,
        severity: 'warning',
        section: label,
        target: `dataset-${index}`,
        title: 'Auto frame count is unused',
        message: 'The selected model does not support auto_frame_count.',
      });
    }
  });

  if (train?.pool_datasets && datasets.length > 1) {
    const batchSizes = new Set(
      datasets.map(ds => (ds.batch_size !== undefined && ds.batch_size !== null ? ds.batch_size : train.batch_size)),
    );
    if (batchSizes.size > 1) {
      add({
        id: 'train.pool_datasets.batch_size',
        path: 'train.pool_datasets',
        severity: 'error',
        section: 'Datasets',
        target: 'datasets',
        title: 'Pooled datasets need the same batch size',
        message: `pool_datasets requires every dataset to resolve to the same batch size, got ${Array.from(batchSizes).join(', ')}.`,
      });
    }
  }

  if (train?.validation_config && train.validation_config.validation_items?.length === 0) {
    add({
      id: 'train.validation_config.empty',
      path: 'train.validation_config.validation_items',
      severity: 'warning',
      section: 'Training',
      target: 'training',
      title: 'Validation has no images',
      message: 'Validation is enabled but no validation images are configured, so it will do nothing.',
    });
  }

  // Stable ordering: errors first, then warnings, then info.
  const order: Record<AuditSeverity, number> = { error: 0, warning: 1, info: 2 };
  return issues.sort((a, b) => order[a.severity] - order[b.severity] || a.section.localeCompare(b.section));
}

export function countIssues(issues: AuditIssue[]) {
  return issues.reduce(
    (acc, issue) => {
      acc[issue.severity] += 1;
      acc.total += 1;
      return acc;
    },
    { error: 0, warning: 0, info: 0, total: 0 },
  );
}
