# Perceptual Ideogram4 Feature Guide

This guide explains the new perceptual training features added to AITK for Ideogram4 LoRA training, with a focus on image datasets.

## What Was Added

- `train.weight_noise`: per-step LoRA parameter noise regularization.
- `depth_consistency`: depth-based auxiliary loss with cached GT depth maps.
- `face_id` auxiliary losses:
  - identity similarity (`identity_loss_*`)
  - landmark shape (`landmark_loss_weight`)
  - body proportion (`body_proportion_loss_*`)
  - body shape (`body_shape_loss_*`)
  - normal map consistency (`normal_loss_*`)
  - VAE anchor features (`vae_anchor_loss_*`)
  - face suppression for diffusion loss (`face_suppression_*`)
- `subject_mask`: cached subject/body/clothing masks used by perceptual paths.
- `train.latent_perceptual_loss_*`: optional latent perceptual auxiliary loss (requires separate package install).
- `loss_split` support for diffusion/depth alternation.

## Where To Configure

There are two levels of config:

1. Process/global level (inside `sd_trainer`):
   - `train`
   - `face_id`
   - `depth_consistency`
   - `subject_mask`

2. Dataset level (inside each `datasets:` entry):
   - per-dataset overrides such as `depth_loss_weight`, `identity_loss_weight`, etc.

Dataset-level values override global values for that dataset.

### In the web UI

- Each dataset card now has a **Timestep Overrides** section for `timestep_type`,
  `min_denoising_steps`, `max_denoising_steps`, and `timestep_weights`.
- Each dataset card also has **Auxiliary Loss Overrides** for the perceptual
  loss weights and their timestep ranges. Empty fields inherit the global value;
  setting a weight to `0` disables that loss for the dataset.
- The global **Auxiliary Losses** card holds the defaults (`face_id`,
  `depth_consistency`, `train.latent_perceptual_loss_*`, subject masks, and
  `loss_split`).
- **Config Check** in the top bar lists errors, warnings, and unused options.
  Errors block **Create Job**; warnings are advisory. The advanced YAML editor
  shows the same issues as Monaco markers.
- Timestep weights are ignored for fixed-step modes (`one_step`, `two_step`,
  `four_step`, `eight_step`); the UI disables them and the trainer logs a
  warning if they are set in advanced config.

## Mixed Mode: Normal + Perceptual In One Run

Recommended pattern:

- Keep global perceptual blocks present (`face_id`, `depth_consistency`, `subject_mask`).
- Set global perceptual weights to `0.0` (or conservative values).
- For normal datasets: leave weights at `0.0`.
- For perceptual datasets: set positive per-dataset weights.

Use this example config file:

- `config/examples/train_lora_ideogram4_mixed_perceptual_24gb.yaml`
- `config/examples/train_lora_ideogram4_pose_first_24gb.yaml`

That file includes two dataset entries:

- `datasets/normal_set_a`: diffusion-only behavior.
- `datasets/perceptual_set_b`: perceptual losses enabled with conservative starter weights.

The pose-first file is a dedicated single-dataset preset focused on body/pose structure with conservative identity pressure.

## Key Dataset Override Fields

Use these inside a `datasets:` item to control behavior per dataset:

- `diffusion_loss_weight`
- `depth_loss_weight`, `depth_loss_min_t`, `depth_loss_max_t`
- `identity_loss_weight`, `identity_loss_min_t`, `identity_loss_max_t`, `identity_loss_min_cos`
- `landmark_loss_weight`
- `body_proportion_loss_weight`, `body_proportion_loss_min_t`, `body_proportion_loss_max_t`
- `body_shape_loss_weight`, `body_shape_loss_min_t`, `body_shape_loss_max_t`
- `normal_loss_weight`, `normal_loss_min_t`, `normal_loss_max_t`
- `vae_anchor_loss_weight`, `vae_anchor_loss_min_t`, `vae_anchor_loss_max_t`
- `face_suppression_weight`, `face_suppression_expand`, `face_suppression_soft`
- `latent_perceptual_loss_weight`, `latent_perceptual_loss_min_t`, `latent_perceptual_loss_max_t`
- `loss_split` (`diffusion_depth` or `sum`)

## Run Workflow

1. Copy the mixed example config to your own file.
2. Replace dataset paths with your real folders.
3. Start with conservative weights (as in example).
4. Run a short smoke training (small step count).
5. Increase perceptual weights gradually only after stable run behavior.

Example command:

```bash
python run.py config/your_mixed_config.yaml
```

## Practical Notes

- Ideogram4 decode paths are model-aware in the trainer.
- Perceptual caches are primed before dataset loading.
- If you do not install optional latent perceptual package, keep `latent_perceptual_loss_weight: 0.0`.
- For image-only training, ignore video-specific settings and fields.

## Troubleshooting

- If startup fails on missing Python modules, install requirements in your training environment.
- If OpenCV errors mention `libGL.so.1`, use a headless OpenCV setup in server environments.
- If performance is unexpectedly slow in face-related caching, verify ONNX runtime uses GPU provider.
