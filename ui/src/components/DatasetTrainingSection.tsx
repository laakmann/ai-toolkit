'use client';

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import classNames from 'classnames';
import { Checkbox, FormGroup, NumberInput, SelectInput } from '@/components/formInputs';
import TimestepWeightsInput from '@/components/TimestepWeightsInput';
import DatasetAugmentationsSection from '@/components/DatasetAugmentationsSection';
import { InlineIssues } from '@/components/ConfigAuditPanel';
import type { AuditIssue } from '@/app/jobs/new/audit';
import type { DatasetConfig, ProcessConfig, TrainConfig } from '@/types';

const TIMESTEP_OPTIONS = [
  { value: '', label: 'Inherit global' },
  { value: 'linear', label: 'Linear' },
  { value: 'sigmoid', label: 'Sigmoid' },
  { value: 'shift', label: 'Shift' },
  { value: 'lognorm_blend', label: 'Lognorm blend' },
  { value: 'weighted', label: 'Weighted' },
  { value: 'one_step', label: 'One step' },
  { value: 'two_step', label: 'Two step' },
  { value: 'four_step', label: 'Four step' },
  { value: 'eight_step', label: 'Eight step' },
  { value: 'next_sample', label: 'Next sample' },
];

const FIXED_STEP_TYPES = new Set(['one_step', 'two_step', 'four_step', 'eight_step']);
const RANGE_IGNORING_TYPES = new Set([...FIXED_STEP_TYPES, 'next_sample']);

interface AuxLossRule {
  key: string;
  label: string;
  weightKey: keyof DatasetConfig;
  minKey?: keyof DatasetConfig;
  maxKey?: keyof DatasetConfig;
  minCosKey?: keyof DatasetConfig;
  globalBlock: 'face_id' | 'depth_consistency' | 'train';
  globalWeightKey: string;
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

const isDefined = (value: unknown) => value !== undefined && value !== null && value !== '';
const toNumber = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) return Number(value);
  return null;
};

function AuxLossRow({
  dataset,
  rule,
  globalValue,
  globalMin,
  globalMax,
  globalMinCos,
  setDataset,
  disabled,
}: {
  dataset: DatasetConfig;
  rule: AuxLossRule;
  globalValue: number | null;
  globalMin: number | null;
  globalMax: number | null;
  globalMinCos: number | null;
  setDataset: (key: keyof DatasetConfig, value: unknown) => void;
  disabled?: boolean;
}) {
  const weight = toNumber(dataset[rule.weightKey]);
  const min = rule.minKey ? toNumber(dataset[rule.minKey]) : null;
  const max = rule.maxKey ? toNumber(dataset[rule.maxKey]) : null;
  const minCos = rule.minCosKey ? toNumber(dataset[rule.minCosKey]) : null;
  const effective = weight ?? globalValue ?? 0;
  const hasRange = isDefined(min) || isDefined(max) || isDefined(minCos);
  const [open, setOpen] = useState(effective > 0 || hasRange);

  const clear = () => {
    setDataset(rule.weightKey, undefined);
    if (rule.minKey) setDataset(rule.minKey, undefined);
    if (rule.maxKey) setDataset(rule.maxKey, undefined);
    if (rule.minCosKey) setDataset(rule.minCosKey, undefined);
  };

  return (
    <div className="rounded border border-gray-800 bg-gray-950/40">
      <button
        type="button"
        onClick={() => setOpen(value => !value)}
        className="flex w-full items-center justify-between gap-2 px-2 py-1.5 text-left"
      >
        <span className="flex min-w-0 items-center gap-2">
          <ChevronDown
            className={classNames('h-3.5 w-3.5 text-gray-500 transition-transform', { '-rotate-90': !open })}
          />
          <span className="truncate text-xs text-gray-300">{rule.label}</span>
        </span>
        <span className={classNames('shrink-0 text-[10px]', effective > 0 ? 'text-emerald-400' : 'text-gray-600')}>
          {effective > 0 ? `active · ${effective}` : 'inherit / off'}
        </span>
      </button>
      {open && (
        <div className="grid grid-cols-2 gap-2 border-t border-gray-800 px-2 pb-2 pt-1 md:grid-cols-4">
          <NumberInput
            label="Weight"
            value={weight}
            allowEmpty
            disabled={disabled}
            placeholder={globalValue !== null ? `global ${globalValue}` : 'inherit'}
            onChange={value => setDataset(rule.weightKey, value === null ? undefined : value)}
          />
          {rule.minKey && (
            <NumberInput
              label="Min t"
              value={min}
              allowEmpty
              disabled={disabled || effective <= 0}
              placeholder={globalMin !== null ? `global ${globalMin}` : 'inherit'}
              onChange={value => setDataset(rule.minKey!, value === null ? undefined : value)}
            />
          )}
          {rule.maxKey && (
            <NumberInput
              label="Max t"
              value={max}
              allowEmpty
              disabled={disabled || effective <= 0}
              placeholder={globalMax !== null ? `global ${globalMax}` : 'inherit'}
              onChange={value => setDataset(rule.maxKey!, value === null ? undefined : value)}
            />
          )}
          {rule.minCosKey && (
            <NumberInput
              label="Min cos"
              value={minCos}
              allowEmpty
              disabled={disabled || effective <= 0}
              placeholder={globalMinCos !== null ? `global ${globalMinCos}` : 'inherit'}
              onChange={value => setDataset(rule.minCosKey!, value === null ? undefined : value)}
            />
          )}
          <button
            type="button"
            onClick={clear}
            disabled={disabled}
            className="col-span-2 self-end rounded border border-gray-700 px-2 py-1 text-[10px] text-gray-400 hover:bg-gray-800 disabled:opacity-40 md:col-span-1"
          >
            Inherit all
          </button>
        </div>
      )}
    </div>
  );
}

export default function DatasetTrainingSection({
  dataset,
  index,
  train,
  processConfig,
  setJobConfig,
  issues,
  disabled,
  showAugmentations = true,
}: {
  dataset: DatasetConfig;
  index: number;
  train: TrainConfig;
  processConfig: ProcessConfig;
  setJobConfig: (value: any, key: string) => void;
  issues: AuditIssue[];
  disabled?: boolean;
  showAugmentations?: boolean;
}) {
  const setDataset = (key: keyof DatasetConfig, value: unknown) => {
    setJobConfig(value, `config.process[0].datasets[${index}].${String(key)}`);
  };

  const hasTimestepOverride = [
    dataset.timestep_type,
    dataset.min_denoising_steps,
    dataset.max_denoising_steps,
    dataset.timestep_weights,
  ].some(isDefined);
  const [showOverrides, setShowOverrides] = useState(hasTimestepOverride);
  const overridesActive = showOverrides || hasTimestepOverride;

  const globalType = train.timestep_type || 'linear';
  const effectiveType = String(dataset.timestep_type || globalType);
  const fixedStep = FIXED_STEP_TYPES.has(effectiveType);
  const ignoresRange = RANGE_IGNORING_TYPES.has(effectiveType);

  const globalDepth = processConfig.depth_consistency as any;
  const globalFace = processConfig.face_id as any;

  const globalValueFor = (rule: AuxLossRule): number | null => {
    if (rule.globalBlock === 'train') return toNumber((train as any)[rule.globalWeightKey]);
    if (rule.globalBlock === 'depth_consistency') return toNumber(globalDepth?.[rule.globalWeightKey]);
    return toNumber(globalFace?.[rule.globalWeightKey]);
  };
  const globalRangeFor = (rule: AuxLossRule, key: 'min' | 'max' | 'minCos'): number | null => {
    const datasetKey = key === 'min' ? rule.minKey : key === 'max' ? rule.maxKey : rule.minCosKey;
    if (!datasetKey) return null;
    if (rule.globalBlock === 'train') {
      const trainKey =
        key === 'min' ? 'latent_perceptual_loss_min_t' : key === 'max' ? 'latent_perceptual_loss_max_t' : null;
      return trainKey ? toNumber((train as any)[trainKey]) : null;
    }
    if (rule.globalBlock === 'depth_consistency') {
      const globalKey = key === 'min' ? 'loss_min_t' : key === 'max' ? 'loss_max_t' : null;
      return globalKey ? toNumber(globalDepth?.[globalKey]) : null;
    }
    return toNumber(globalFace?.[String(datasetKey)]);
  };

  const timestepIssues = issues.filter(issue => issue.target === `dataset-${index}-timestep`);
  const auxIssues = issues.filter(issue => issue.target === `dataset-${index}-aux`);

  const setTriState = (key: keyof DatasetConfig, value: string) => {
    setDataset(key, value === '' ? undefined : value === 'true');
  };

  return (
    <div className="space-y-3 border-t border-gray-800 pt-3" data-audit-target={`dataset-${index}-timestep`}>
      <FormGroup label="Timestep Overrides">
        <Checkbox
          label="Override global timestep settings"
          checked={overridesActive}
          disabled={disabled}
          onChange={checked => {
            setShowOverrides(checked);
            if (!checked) {
              setDataset('timestep_type', undefined);
              setDataset('min_denoising_steps', undefined);
              setDataset('max_denoising_steps', undefined);
              setDataset('timestep_weights', undefined);
            }
          }}
        />
      </FormGroup>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        <SelectInput
          label="Timestep Type"
          value={String(dataset.timestep_type || '')}
          disabled={disabled || !overridesActive}
          options={[
            {
              value: '',
              label: `Inherit global (${globalType})`,
            },
            ...TIMESTEP_OPTIONS.filter(option => option.value !== ''),
          ]}
          onChange={value => setDataset('timestep_type', value === '' ? undefined : value)}
        />
        <NumberInput
          label="Min Denoising Steps"
          value={toNumber(dataset.min_denoising_steps)}
          allowEmpty
          disabled={disabled || !overridesActive || ignoresRange}
          placeholder={String((train as any).min_denoising_steps ?? 0)}
          onChange={value => setDataset('min_denoising_steps', value === null ? undefined : value)}
        />
        <NumberInput
          label="Max Denoising Steps"
          value={toNumber(dataset.max_denoising_steps)}
          allowEmpty
          disabled={disabled || !overridesActive || ignoresRange}
          placeholder={String((train as any).max_denoising_steps ?? 999)}
          onChange={value => setDataset('max_denoising_steps', value === null ? undefined : value)}
        />
        <div>
          <TimestepWeightsInput
            value={dataset.timestep_weights}
            disabled={disabled || !overridesActive || fixedStep}
            onChange={value => setDataset('timestep_weights', value)}
          />
        </div>
      </div>

      {overridesActive && fixedStep ? (
        <div className="text-xs text-amber-400">
          {effectiveType} selects a fixed step set, so min/max ranges and weights are not used.
        </div>
      ) : null}
      {overridesActive && effectiveType === 'next_sample' ? (
        <div className="text-xs text-gray-500">next_sample uses the range as a start-point window.</div>
      ) : null}

      <InlineIssues issues={timestepIssues} />

      <div data-audit-target={`dataset-${index}-aux`}>
        <FormGroup label="Auxiliary Loss Overrides">
          <div className="text-[11px] text-gray-500">
            Leave a field empty to inherit the global value. A weight of 0 disables that loss for this dataset.
          </div>
        </FormGroup>
        <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
          {AUX_LOSSES.map(rule => (
            <AuxLossRow
              key={rule.key}
              dataset={dataset}
              rule={rule}
              disabled={disabled}
              globalValue={globalValueFor(rule)}
              globalMin={globalRangeFor(rule, 'min')}
              globalMax={globalRangeFor(rule, 'max')}
              globalMinCos={globalRangeFor(rule, 'minCos')}
              setDataset={setDataset}
            />
          ))}
        </div>

        <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          <NumberInput
            label="Face Suppression Weight"
            value={toNumber(dataset.face_suppression_weight)}
            allowEmpty
            disabled={disabled}
            placeholder={
              globalFace?.face_suppression_weight != null ? `global ${globalFace.face_suppression_weight}` : 'inherit'
            }
            onChange={value => setDataset('face_suppression_weight', value === null ? undefined : value)}
          />
          <NumberInput
            label="Face Suppression Expand"
            value={toNumber(dataset.face_suppression_expand)}
            allowEmpty
            disabled={disabled}
            onChange={value => setDataset('face_suppression_expand', value === null ? undefined : value)}
          />
          <SelectInput
            label="Face Suppression Soft"
            value={
              dataset.face_suppression_soft === true ? 'true' : dataset.face_suppression_soft === false ? 'false' : ''
            }
            disabled={disabled}
            options={[
              { value: '', label: 'Inherit global' },
              { value: 'true', label: 'On' },
              { value: 'false', label: 'Off' },
            ]}
            onChange={value => setTriState('face_suppression_soft', value)}
          />
          <SelectInput
            label="Restrict Perceptual To Body"
            value={
              dataset.perceptual_restrict_to_body === true
                ? 'true'
                : dataset.perceptual_restrict_to_body === false
                  ? 'false'
                  : ''
            }
            disabled={disabled}
            options={[
              { value: '', label: 'Inherit global' },
              { value: 'true', label: 'On' },
              { value: 'false', label: 'Off' },
            ]}
            onChange={value => setTriState('perceptual_restrict_to_body', value)}
          />
          <SelectInput
            label="Loss Split"
            value={dataset.loss_split || ''}
            disabled={disabled}
            options={[
              { value: '', label: 'Inherit global' },
              { value: 'sum', label: 'Sum diffusion + depth' },
              { value: 'diffusion_depth', label: 'Alternate diffusion / depth' },
            ]}
            onChange={value => setDataset('loss_split', value === '' ? undefined : value)}
          />
        </div>

        <InlineIssues issues={auxIssues} className="mt-2" />
      </div>

      {showAugmentations && (
        <div className="mt-3" data-audit-target={`dataset-${index}-augmentations`}>
          <DatasetAugmentationsSection
            value={dataset.augmentations}
            onChange={value => setDataset('augmentations', value)}
            shuffle={dataset.shuffle_augmentations}
            onShuffleChange={value => setDataset('shuffle_augmentations', value ? true : undefined)}
            cachingEnabled={Boolean(dataset.cache_latents || dataset.cache_latents_to_disk)}
            disabled={disabled}
          />
        </div>
      )}
    </div>
  );
}
