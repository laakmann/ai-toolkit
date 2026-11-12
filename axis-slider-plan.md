# Axis-Conditioned Pseudo-Slider Plan (Ideogram 4)

## Goal

Get slider-like control where we can nudge multiple dimensions (example: waist and height) in either direction with minimal impact on identity, background, and unrelated attributes.

## Key Idea

- Use one LoRA plus explicit axis controls in captions/prompts.
- Keep LoRA multiplier fixed during training.
- Drive edits through axis tokens / JSON fields instead of a single global slider weight.
- Add loss terms that explicitly reduce axis coupling.

This is **pseudo-independent** control: stronger decoupling than default prompt behavior, but not perfectly orthogonal.

## Why Not Stock Slider Alone

Stock slider training is directional and often less dataset-dependent, but it is centered around multiplier polarity and is not designed for robust multi-axis disentanglement.

For waist/height decoupling, we need explicit axis supervision and anti-coupling objectives.

## Data Requirements

Use a matrixed dataset:

- waist: `small | medium | large`
- height: `short | medium | tall`

Target balanced coverage across all cells so each axis varies while the other is held/varied independently.

Practical first-pass scale:

- ~100-300 images per cell (9 cells = ~900-2700 images)

## Captioning Requirements

Use Ideogram structured JSON captions and include normalized axis controls, for example:

- `axis_waist:small`
- `axis_height:tall`

Recommended: include axis tags in both JSON fields and plain text tokens for robustness.

Keep vocabulary/template consistent across the full dataset.

## Trainer Design (Extension)

Implement as a new extension process (config-driven, reusable for any axis set), not a one-off hardcoded script.

Loss (v1):

1. Base denoising loss
2. Axis-target loss (requested axis moves)
3. Cross-axis invariance loss (non-requested axis stays stable)
4. Preservation loss (identity/background/composition stability)

Optional later:

- Orthogonality regularization between axis deltas
- Commutativity consistency for multi-axis edits

## Inference Behavior

Use axis control tokens/fields in the prompt/caption to steer direction:

- waist up/down
- height up/down

Goal is local, attribute-specific nudges with minimal collateral change.

## Validation Protocol

At each checkpoint, run a fixed 3x3 grid (waist x height) under the same base scene prompt.

Track:

- requested-axis response strength
- non-requested-axis leakage
- identity/background drift

Select checkpoints by this matrix, not only train loss.

## Estimated Effort

Robust reusable v1: ~1.5 to 3 weeks

- 1-2 days: config schema + extension skeleton
- 3-6 days: multi-axis loss/training loop/logging
- 2-4 days: eval matrix + tuning

## Recommended First Version

- Two axes only (`waist`, `height`)
- Discrete bins first (3 levels each)
- Fixed axis vocabulary
- Strong validation grid before expanding to continuous controls or more axes

## Generalization Path

Design config as axis list so adding new targets requires data + config only, e.g.:

- shoulder width
- age appearance
- muscle mass
- hair length

No core code changes needed if axis definitions remain schema-compatible.
