import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AUGMENTATION_PRESETS,
  cloneAugmentationEntries,
  formatAugmentations,
  mergeAugmentationParams,
  parseAugmentationParamsText,
  parseAugmentationsText,
  splitAugmentationParams,
  validateAugmentations,
} from '../ui/src/utils/augmentations.ts';

const exampleYaml = `augmentations:
  - method: RandomBrightnessContrast
    params:
      brightness_limit: 0.12
      contrast_limit: 0.1
      p: 0.7
  - method: HueSaturationValue
    params:
      hue_shift_limit: 5
      sat_shift_limit: 10
      val_shift_limit: 10
      p: 0.5
  - method: GaussianBlur
    params:
      blur_limit:
        - 3
        - 3
      p: 0.2
`;

test('valid augmentation entries pass validation and preserve nested params', () => {
  const parsed = parseAugmentationsText(exampleYaml);
  assert.equal(parsed.error, undefined);
  assert.equal(parsed.entries.length, 3);
  assert.equal(parsed.entries[0].method, 'RandomBrightnessContrast');
  assert.equal(parsed.entries[0].params?.brightness_limit, 0.12);
  assert.deepEqual(parsed.entries[2].params?.blur_limit, [3, 3]);

  const validation = validateAugmentations(parsed.entries);
  assert.deepEqual(validation.errors, []);
  assert.deepEqual(validation.warnings, []);
});

test('JSON input is accepted by the raw list parser', () => {
  const input = JSON.stringify([
    { method: 'HorizontalFlip', params: { p: 0.5 } },
    { method: 'ColorJitter', params: { brightness: 0.1, p: 0.25 } },
  ]);
  const parsed = parseAugmentationsText(input);
  assert.equal(parsed.error, undefined);
  assert.equal(parsed.entries.length, 2);
});

test('invalid augmentation lists report an error', () => {
  assert.match(parseAugmentationsText('not: a list').error ?? '', /must be a list/i);
  assert.match(parseAugmentationsText('[{ "params": {} }]').error ?? '', /missing a method/i);
  assert.match(
    parseAugmentationsText('[{ "method": "HorizontalFlip", "params": { "p": 2 } }]').error ?? '',
    /p must be a number between 0 and 1/i,
  );
  assert.match(parseAugmentationsText('[invalid').error ?? '', /invalid YAML or JSON/i);
});

test('unknown methods are warnings, not errors', () => {
  const validation = validateAugmentations([{ method: 'SomeFutureTransform', params: { p: 0.25 } }]);
  assert.deepEqual(validation.errors, []);
  assert.equal(validation.warnings.length, 1);
  assert.match(validation.warnings[0], /not in the curated list/i);
});

test('format and parse round-trip values', () => {
  const parsed = parseAugmentationsText(exampleYaml);
  const roundTrip = parseAugmentationsText(formatAugmentations(parsed.entries));
  assert.equal(roundTrip.error, undefined);
  assert.deepEqual(roundTrip.entries, parsed.entries);
});

test('preset cloning does not mutate the preset definition', () => {
  const preset = AUGMENTATION_PRESETS[0];
  const original = JSON.stringify(preset.entries);
  const clone = cloneAugmentationEntries(preset.entries);

  clone[0].params = { p: 0.99 };
  clone.push({ method: 'HorizontalFlip', params: { p: 1 } });

  assert.equal(JSON.stringify(preset.entries), original);
});

test('params can be parsed from YAML and split from p', () => {
  const parsed = parseAugmentationParamsText('brightness_limit: 0.2\ncontrast_limit: 0.1\np: 0.6');
  assert.equal(parsed.error, undefined);
  assert.deepEqual(parsed.params, {
    brightness_limit: 0.2,
    contrast_limit: 0.1,
    p: 0.6,
  });

  const split = splitAugmentationParams(parsed.params);
  assert.equal(split.p, 0.6);
  assert.deepEqual(split.rest, { brightness_limit: 0.2, contrast_limit: 0.1 });
  assert.deepEqual(mergeAugmentationParams(split.rest, split.p), {
    brightness_limit: 0.2,
    contrast_limit: 0.1,
    p: 0.6,
  });
});

test('empty params text and removed p are handled', () => {
  assert.deepEqual(parseAugmentationParamsText('  ').params, {});
  assert.match(parseAugmentationParamsText('- 1\n- 2').error ?? '', /mapping/i);
  assert.deepEqual(mergeAugmentationParams({ brightness_limit: 0.2 }, null), {
    brightness_limit: 0.2,
  });
});
