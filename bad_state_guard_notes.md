# Bad State Guard Notes (Targeted Flow)

This is a practical reference for how `bad_state_guard` currently behaves, how to tune it, and how to interpret the logs.

## Scope and Current Support

- Guard is configured at `train.bad_state_guard` (train-level, not per-dataset).
- `loss_type` is currently supported for `targeted_flow` only.
- `mode` currently supports:
  - `standard`
  - `adaptive_repel`

## How It Works Internally

When guard is applied on a step:

1. A bad-state latent is loaded from `bad_state_guard.path` and swapped into `batch.unconditional_latents`.
2. `targeted_flow_guidance(...)` is run using:
   - target latents: `batch.latents` (the training sample latent)
   - source latents: `batch.unconditional_latents` (temporarily replaced with bad-state latent)
3. Guard loss is added to total loss (scaled by `bad_state_guard.multiplier`).

In adaptive mode (`mode: adaptive_repel`), an extra repel term is computed when prediction appears closer to bad-state source than target.

Important: this is a latent-space proxy, not a direct image classifier for filter screens.

## Trigger Logic (Adaptive Repel)

Adaptive score is based on latent distances:

- `d_target = dist(predicted_latent, target_latent)`
- `d_source = dist(predicted_latent, source_latent)`
- `score = d_target - d_source`

Interpretation:

- larger positive score = prediction is relatively closer to bad-state source
- repel activates via `relu(score - (trigger_threshold + repel_margin))`

So:

- lower `trigger_threshold` = easier trigger (more aggressive)
- higher `trigger_threshold` = harder trigger (more selective)
- negative threshold = very permissive trigger

## Scaling Stack (What Actually Scales What)

Repel and guard are scaled in stages:

1. `repel_raw` (from trigger activation)
2. `repel_weight` and adaptive `repel_scale` (internal to adaptive mode)
3. `bad_state_guard.multiplier` (scales full guard contribution)
4. batch-level loss scaling later in training loop (for effective gradient impact)

Additional adaptive controls:

- `base_weight` (default `1.0`): scales base targeted-flow guard component.
- `on_trigger_action` (default `add`):
  - `add`: base + repel when triggered
  - `replace_base`: when triggered, drop base and use repel branch only
- `triggered_repel_boost` (default `1.0`): extra multiplier on repel branch when triggered.

Practical meaning:

- `repel_weight` changes relative repel intensity inside guard
- `multiplier` changes overall guard intensity (base + repel)
- `base_weight` reduces or preserves base targeted-flow pull inside guard
- `on_trigger_action: replace_base` gives more direct anti-screen behavior
- `triggered_repel_boost` strengthens triggered repel without globally increasing base guard pull

## Metric Meanings

- `bad_state_guard/applied`
  - guard ran this step (passed probability + gating)
- `bad_state_guard/repel_triggered`
  - adaptive repel condition triggered (not just that guard ran)
- `bad_state_guard/repel_score`
  - distance-based trigger score (`d_target - d_source`)
- `bad_state_guard/repel_scale`
  - adaptive cap-based multiplier used for repel
- `loss/bad_state_guard/repel_raw`
  - raw activation before repel weight/scale and before outer multiplier
- `loss/bad_state_guard/repel_effective`
  - repel contribution after internal scaling and outer guard multiplier
- `loss/bad_state_guard/raw`
  - total guard loss before outer multiplier
- `loss/bad_state_guard/effective`
  - total guard contribution after outer multiplier

## Why Triggered Can Drop Fast Without Visual Match

`repel_triggered` can drop quickly even if samples still look screened because:

- trigger is latent-distance based, not direct visual screen detection
- very strong guard settings can push to a different compromise region
- UI moving averages can hide sparse-step behavior if combined with gating

Always inspect together:

- `bad_state_guard/applied`
- `bad_state_guard/repel_triggered`
- `bad_state_guard/repel_score`
- `loss/bad_state_guard/effective`

## Common Config Pitfalls

- Typo: use `warmup_steps`, not `warm_up_steps`.
- `mode` omitted means default `standard` (no adaptive repel branch).
- `apply_to_reg: true` can increase interaction with reg behavior; default is `false`.

## Suggested Starting Presets

If VRAM is not a limiter, start with balanced settings and adjust from logs:

```yaml
bad_state_guard:
  enabled: true
  path: /path/to/bad_state_images
  loss_type: targeted_flow
  mode: adaptive_repel
  multiplier: 0.006
  probability: 0.50
  apply_to_reg: false
  repel_weight: 1.0
  trigger_threshold: 0.00
  repel_margin: 0.01
  max_repel_scale: 3.0
  warmup_steps: 50
  cache_latents: true
  match_strategy: nearest_aspect
  resize_mode: cover
```

If too weak:

- raise `multiplier` first, then `probability`

If oscillating/reverting:

- lower `multiplier` first
- raise `trigger_threshold` and/or `repel_margin` to be more selective

If escape is too slow:

- reduce `base_weight` (for example `0.25` to `0.5`)
- set `on_trigger_action: replace_base`
- increase `triggered_repel_boost` (for example `1.5` to `3.0`)

## Denoising Range Interaction

Dataset-level `min_denoising_steps`/`max_denoising_steps` affect both base targeted-flow and guard behavior.

- narrow early ranges can help initial escape but may slow stable convergence later
- with adaptive repel, consider widening range after breakthrough stabilizes

## Reg Dataset Interaction

- Guard formula is the same on reg/non-reg when it runs.
- But total update context differs due to reg weighting and other reg-related losses.
- Default recommendation with reg consistency: keep `apply_to_reg: false` first, then opt in only if needed.

## Optional Workflow Tip

If the goal is mainly anti-filter behavior with minimal new concept drift:

- using near-identical conditional/unconditional pairs can reduce unrelated directionality
- but training may become slower if guard is the only strong signal
