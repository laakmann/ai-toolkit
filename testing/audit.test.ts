import test from 'node:test';
import assert from 'node:assert/strict';
import { auditJobConfig, countIssues } from '../ui/src/app/jobs/new/audit.ts';

const baseConfig = (overrides: any = {}) => {
  const config: any = {
    job: 'extension',
    config: {
      name: 'test',
      process: [
        {
          type: 'diffusion_trainer',
          training_folder: 'output',
          device: 'cuda',
          save: {},
          model: { arch: 'ideogram4', name_or_path: 'x' },
          sample: {},
          logging: {},
          train: {
            batch_size: 1,
            noise_scheduler: 'flowmatch',
            timestep_type: 'sigmoid',
            content_or_style: 'balanced',
            num_train_timesteps: 1000,
            steps: 1000,
            ...(overrides.train || {}),
          },
          datasets: [
            {
              folder_path: '/data/a',
              resolution: [512],
              num_frames: 1,
              ...(overrides.dataset || {}),
            },
          ],
          ...(overrides.process || {}),
        },
      ],
    },
    meta: { name: '[name]', version: '1.0' },
  };
  return config;
};

const arch = { name: 'ideogram4', group: 'image', additionalSections: [] };

test('clean config has no issues', () => {
  assert.deepEqual(auditJobConfig({ config: baseConfig(), arch }), []);
});

test('fixed-step type marks weights as ignored', () => {
  const issues = auditJobConfig({
    config: baseConfig({
      train: { timestep_type: 'two_step' },
      dataset: { timestep_weights: [1, 1] },
    }),
    arch,
  });
  assert.ok(issues.some(issue => issue.id.includes('timestep_weights.fixed_steps')));
  assert.ok(issues.some(issue => issue.severity === 'warning'));
});

test('inverted timestep range is an error', () => {
  const issues = auditJobConfig({
    config: baseConfig({ dataset: { min_denoising_steps: 800, max_denoising_steps: 200 } }),
    arch,
  });
  const issue = issues.find(item => item.id.includes('timestep_range.inverted'));
  assert.ok(issue);
  assert.equal(issue?.severity, 'error');
});

test('all-zero weights are an error', () => {
  const issues = auditJobConfig({ config: baseConfig({ dataset: { timestep_weights: [0, 0] } }), arch });
  assert.ok(issues.some(issue => issue.id.includes('timestep_weights.zero') && issue.severity === 'error'));
});

test('aux range with zero weight is flagged unused', () => {
  const issues = auditJobConfig({
    config: baseConfig({ dataset: { identity_loss_weight: 0, identity_loss_min_t: 0.2 } }),
    arch,
  });
  assert.ok(issues.some(issue => issue.id.includes('identity.unused_range') && issue.severity === 'warning'));
});

test('aux weight without global block warns', () => {
  const issues = auditJobConfig({
    config: baseConfig({ dataset: { identity_loss_weight: 0.5 } }),
    arch,
  });
  assert.ok(issues.some(issue => issue.id.includes('identity.missing_block') && issue.severity === 'warning'));
});

test('loss split without depth is unused', () => {
  const issues = auditJobConfig({
    config: baseConfig({ dataset: { loss_split: 'diffusion_depth' } }),
    arch,
  });
  assert.ok(issues.some(issue => issue.id.includes('loss_split.unused')));
});

test('diffusion_loss_weight is reported as unused', () => {
  const issues = auditJobConfig({
    config: baseConfig({ dataset: { diffusion_loss_weight: 1 } }),
    arch,
  });
  assert.ok(issues.some(issue => issue.id.includes('diffusion_loss_weight.unused')));
});

test('countIssues groups by severity', () => {
  const counts = countIssues([
    { id: 'a', path: '', severity: 'error', section: '', target: '', title: '', message: '' },
    { id: 'b', path: '', severity: 'warning', section: '', target: '', title: '', message: '' },
    { id: 'c', path: '', severity: 'info', section: '', target: '', title: '', message: '' },
  ]);
  assert.deepEqual(counts, { error: 1, warning: 1, info: 1, total: 3 });
});
