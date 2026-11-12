'use client';

import { Checkbox, FormGroup, NumberInput, SelectInput } from '@/components/formInputs';
import { InlineIssues } from '@/components/ConfigAuditPanel';
import type { AuditIssue } from '@/app/jobs/new/audit';
import type { ProcessConfig, TrainConfig } from '@/types';

const toNumber = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) return Number(value);
  return null;
};

export default function AuxiliaryLossSettings({
  train,
  processConfig,
  setJobConfig,
  disabled,
  issues = [],
}: {
  train: TrainConfig;
  processConfig: ProcessConfig;
  setJobConfig: (value: any, key: string) => void;
  disabled?: boolean;
  issues?: AuditIssue[];
}) {
  const depth = processConfig.depth_consistency as any;
  const face = processConfig.face_id as any;
  const subjectMask = processConfig.subject_mask as any;

  const setDepth = (key: string, value: unknown) => setJobConfig(value, `config.process[0].depth_consistency.${key}`);
  const setFace = (key: string, value: unknown) => setJobConfig(value, `config.process[0].face_id.${key}`);
  const setMask = (key: string, value: unknown) => setJobConfig(value, `config.process[0].subject_mask.${key}`);
  const setTrain = (key: string, value: unknown) => setJobConfig(value, `config.process[0].train.${key}`);

  const lossSplitValue = train.loss_split || '';

  return (
    <div className="space-y-4">
      <p className="text-[11px] text-gray-500">
        These are the defaults every dataset inherits. Per-dataset overrides live in each dataset card. Leave a field
        empty to use the class default.
      </p>

      <FormGroup label="Depth Consistency">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <NumberInput
            label="Weight"
            value={toNumber(depth?.loss_weight)}
            allowEmpty
            disabled={disabled}
            placeholder="0.1"
            onChange={value => setDepth('loss_weight', value === null ? undefined : value)}
          />
          <NumberInput
            label="Min t"
            value={toNumber(depth?.loss_min_t)}
            allowEmpty
            disabled={disabled}
            placeholder="0.0"
            onChange={value => setDepth('loss_min_t', value === null ? undefined : value)}
          />
          <NumberInput
            label="Max t"
            value={toNumber(depth?.loss_max_t)}
            allowEmpty
            disabled={disabled}
            placeholder="1.0"
            onChange={value => setDepth('loss_max_t', value === null ? undefined : value)}
          />
        </div>
      </FormGroup>

      <FormGroup label="Face / Body Perceptual">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <NumberInput
            label="Identity Weight"
            value={toNumber(face?.identity_loss_weight)}
            allowEmpty
            disabled={disabled}
            placeholder="0.0"
            onChange={value => setFace('identity_loss_weight', value === null ? undefined : value)}
          />
          <NumberInput
            label="Identity Min t"
            value={toNumber(face?.identity_loss_min_t)}
            allowEmpty
            disabled={disabled}
            placeholder="0.0"
            onChange={value => setFace('identity_loss_min_t', value === null ? undefined : value)}
          />
          <NumberInput
            label="Identity Max t"
            value={toNumber(face?.identity_loss_max_t)}
            allowEmpty
            disabled={disabled}
            placeholder="1.0"
            onChange={value => setFace('identity_loss_max_t', value === null ? undefined : value)}
          />
          <NumberInput
            label="Identity Min Cos"
            value={toNumber(face?.identity_loss_min_cos)}
            allowEmpty
            disabled={disabled}
            placeholder="0.2"
            onChange={value => setFace('identity_loss_min_cos', value === null ? undefined : value)}
          />

          <NumberInput
            label="Landmark Weight"
            value={toNumber(face?.landmark_loss_weight)}
            allowEmpty
            disabled={disabled}
            placeholder="0.0"
            onChange={value => setFace('landmark_loss_weight', value === null ? undefined : value)}
          />
          <NumberInput
            label="Body Proportion Weight"
            value={toNumber(face?.body_proportion_loss_weight)}
            allowEmpty
            disabled={disabled}
            placeholder="0.0"
            onChange={value => setFace('body_proportion_loss_weight', value === null ? undefined : value)}
          />
          <NumberInput
            label="Body Proportion Min t"
            value={toNumber(face?.body_proportion_loss_min_t)}
            allowEmpty
            disabled={disabled}
            placeholder="0.0"
            onChange={value => setFace('body_proportion_loss_min_t', value === null ? undefined : value)}
          />
          <NumberInput
            label="Body Proportion Max t"
            value={toNumber(face?.body_proportion_loss_max_t)}
            allowEmpty
            disabled={disabled}
            placeholder="1.0"
            onChange={value => setFace('body_proportion_loss_max_t', value === null ? undefined : value)}
          />

          <NumberInput
            label="Body Shape Weight"
            value={toNumber(face?.body_shape_loss_weight)}
            allowEmpty
            disabled={disabled}
            placeholder="0.0"
            onChange={value => setFace('body_shape_loss_weight', value === null ? undefined : value)}
          />
          <NumberInput
            label="Body Shape Min t"
            value={toNumber(face?.body_shape_loss_min_t)}
            allowEmpty
            disabled={disabled}
            placeholder="0.4"
            onChange={value => setFace('body_shape_loss_min_t', value === null ? undefined : value)}
          />
          <NumberInput
            label="Body Shape Max t"
            value={toNumber(face?.body_shape_loss_max_t)}
            allowEmpty
            disabled={disabled}
            placeholder="0.8"
            onChange={value => setFace('body_shape_loss_max_t', value === null ? undefined : value)}
          />
          <NumberInput
            label="Body Shape Min Cos"
            value={toNumber(face?.body_shape_loss_min_cos)}
            allowEmpty
            disabled={disabled}
            placeholder="0.2"
            onChange={value => setFace('body_shape_loss_min_cos', value === null ? undefined : value)}
          />

          <NumberInput
            label="Normal Weight"
            value={toNumber(face?.normal_loss_weight)}
            allowEmpty
            disabled={disabled}
            placeholder="0.0"
            onChange={value => setFace('normal_loss_weight', value === null ? undefined : value)}
          />
          <NumberInput
            label="Normal Min t"
            value={toNumber(face?.normal_loss_min_t)}
            allowEmpty
            disabled={disabled}
            placeholder="0.4"
            onChange={value => setFace('normal_loss_min_t', value === null ? undefined : value)}
          />
          <NumberInput
            label="Normal Max t"
            value={toNumber(face?.normal_loss_max_t)}
            allowEmpty
            disabled={disabled}
            placeholder="0.8"
            onChange={value => setFace('normal_loss_max_t', value === null ? undefined : value)}
          />
          <NumberInput
            label="VAE Anchor Weight"
            value={toNumber(face?.vae_anchor_loss_weight)}
            allowEmpty
            disabled={disabled}
            placeholder="0.0"
            onChange={value => setFace('vae_anchor_loss_weight', value === null ? undefined : value)}
          />
          <NumberInput
            label="VAE Anchor Min t"
            value={toNumber(face?.vae_anchor_loss_min_t)}
            allowEmpty
            disabled={disabled}
            placeholder="0.0"
            onChange={value => setFace('vae_anchor_loss_min_t', value === null ? undefined : value)}
          />
          <NumberInput
            label="VAE Anchor Max t"
            value={toNumber(face?.vae_anchor_loss_max_t)}
            allowEmpty
            disabled={disabled}
            placeholder="0.5"
            onChange={value => setFace('vae_anchor_loss_max_t', value === null ? undefined : value)}
          />
          <NumberInput
            label="Face Suppression Weight"
            value={toNumber(face?.face_suppression_weight)}
            allowEmpty
            disabled={disabled}
            placeholder="off"
            onChange={value => setFace('face_suppression_weight', value === null ? undefined : value)}
          />
          <NumberInput
            label="Face Suppression Expand"
            value={toNumber(face?.face_suppression_expand)}
            allowEmpty
            disabled={disabled}
            placeholder="2.0"
            onChange={value => setFace('face_suppression_expand', value === null ? undefined : value)}
          />
          <SelectInput
            label="Face Suppression Soft"
            value={face?.face_suppression_soft === true ? 'true' : face?.face_suppression_soft === false ? 'false' : ''}
            disabled={disabled}
            options={[
              { value: '', label: 'Default (off)' },
              { value: 'true', label: 'On' },
              { value: 'false', label: 'Off' },
            ]}
            onChange={value => setFace('face_suppression_soft', value === '' ? undefined : value === 'true')}
          />
        </div>
      </FormGroup>

      <FormGroup label="Latent Perceptual">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <NumberInput
            label="Weight"
            value={toNumber(train.latent_perceptual_loss_weight)}
            allowEmpty
            disabled={disabled}
            placeholder="0.0"
            onChange={value => setTrain('latent_perceptual_loss_weight', value === null ? undefined : value)}
          />
          <NumberInput
            label="Min t"
            value={toNumber(train.latent_perceptual_loss_min_t)}
            allowEmpty
            disabled={disabled}
            placeholder="0.0"
            onChange={value => setTrain('latent_perceptual_loss_min_t', value === null ? undefined : value)}
          />
          <NumberInput
            label="Max t"
            value={toNumber(train.latent_perceptual_loss_max_t)}
            allowEmpty
            disabled={disabled}
            placeholder="0.5"
            onChange={value => setTrain('latent_perceptual_loss_max_t', value === null ? undefined : value)}
          />
        </div>
        <p className="mt-1 text-[11px] text-gray-500">
          The global weight must be above zero before per-dataset latent perceptual overrides can apply.
        </p>
      </FormGroup>

      <FormGroup label="Subject Masks">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <Checkbox
            label="Enable subject masks"
            checked={subjectMask?.enabled === true}
            disabled={disabled}
            onChange={value => setMask('enabled', value)}
          />
          <Checkbox
            label="Restrict perceptual losses to body"
            checked={subjectMask?.perceptual_restrict_to_body === true}
            disabled={disabled}
            onChange={value => setMask('perceptual_restrict_to_body', value)}
          />
        </div>
      </FormGroup>

      <FormGroup label="Loss Split">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <SelectInput
            label="Global Loss Split"
            value={lossSplitValue}
            disabled={disabled}
            options={[
              { value: '', label: 'Auto' },
              { value: 'sum', label: 'Sum diffusion + depth' },
              { value: 'diffusion_depth', label: 'Alternate diffusion / depth' },
            ]}
            onChange={value => setTrain('loss_split', value === '' ? undefined : value)}
          />
        </div>
      </FormGroup>

      <InlineIssues issues={issues.filter(issue => issue.target === 'aux')} />
    </div>
  );
}
