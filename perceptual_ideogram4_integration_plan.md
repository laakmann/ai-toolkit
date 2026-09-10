## Perceptual + Ideogram4 Integration Plan

### Branch and safety
- Working branch: `integration/perceptual-ideogram4`
- Safety branch created from original state: `backup/pre-perceptual-ideogram4-20260910`
- Upstream sync merged first to reduce later conflict fan-out.

### Phase 1: baseline merge and compatibility
1. Merge latest `upstream/main` into integration branch.
2. Resolve conflict hotspots preserving local behavior:
   - `extensions_built_in/sd_trainer/SDTrainer.py`
   - `ui/src/components/JobLossGraph.tsx`
   - `ui/src/components/SampleImages.tsx`
3. Restore local `.gitignore` additions (`/cache/`, `/logs/`).

### Phase 2: low-risk perceptual scaffolding (done/started)
1. Add `weight_noise` config schema in `TrainConfig`.
2. Tag LoRA-owned parameters with `_is_lora` for filtered perturbation.
3. Add post-step LoRA `weight_noise` injection in `SDTrainer`.
4. Add loss-split resolver module (`toolkit/loss_split.py`).
5. Add per-dataset perceptual override fields to config + batch DTO plumbing.
6. Add Ideogram4 24GB example config with weight-noise defaults.

### Phase 3: perceptual modules backport (next)
1. Port required modules from perceptual fork:
   - `toolkit/depth_consistency.py`
   - `toolkit/face_id.py`
   - `toolkit/subject_mask.py`
   - `toolkit/vae_anchor.py`
2. Add missing config classes used by those modules:
   - `FaceIDConfig`, `DepthConsistencyConfig`, `SubjectMaskConfig`
3. Add minimum dependency declarations:
   - `insightface`, `onnxruntime-gpu`, `onnx2torch`, `dsntnn`, `ultralytics`
   - optional: `elatentlpips`

### Phase 4: trainer wiring for perceptual losses + Ideogram4 decode
1. Import perceptual modules in `SDTrainer`.
2. Add cache warmup steps before training loop.
3. Add training-step auxiliary losses with per-dataset override resolution.
4. Route all perceptual x0->pixel decode paths through model-aware decode:
   - Ideogram4 must use `self.sd.decode_latents(...)`.
5. Add guarded decoder checkpointing hook for Ideogram4 if needed at 1024px.

### Phase 5: validation and stabilization
1. Run python compile checks on touched python files.
2. Run targeted smoke config parse/train-start checks.
3. Validate no regressions in existing local custom features.
4. Keep incremental commits at each phase boundary.

### Commit strategy
- Small commits with narrow scope.
- Messages format: `feat(...)`, `fix(...)`, `chore(...)`, `merge(...)`.
- Do not squash until full integration verified.
