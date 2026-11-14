/**
 * GPU API response
 */

export interface GpuUtilization {
  gpu: number;
  memory: number;
}

export interface GpuMemory {
  total: number;
  free: number;
  used: number;
  // unified memory (e.g. GB10): figures are the system RAM pool the GPU shares
  shared?: boolean;
}

export interface GpuPower {
  draw: number;
  limit: number;
}

export interface GpuClocks {
  graphics: number;
  memory: number;
}

export interface GpuFan {
  speed: number;
}

export interface GpuInfo {
  index: number;
  name: string;
  driverVersion: string;
  temperature: number;
  utilization: GpuUtilization;
  memory: GpuMemory;
  power: GpuPower;
  clocks: GpuClocks;
  fan: GpuFan;
}

export interface CpuInfo {
  name: string;
  cores: number;
  temperature: number;
  totalMemory: number;
  freeMemory: number;
  availableMemory: number;
  currentLoad: number;
}

export interface GPUApiResponse {
  hasNvidiaSmi: boolean;
  isMac: boolean;
  gpus: GpuInfo[];
  error?: string;
}

/**
 * System monitor stream (SSE at /api/monitor)
 */

// Rolling history only logs load + memory; everything else (temps, fans,
// power, clocks) is instantaneous-only via MonitorSample.
export interface MonitorHistoryPoint {
  t: number; // epoch ms
  cpu: { load: number; memUsedMb: number };
  // one entry per GPU, same order as MonitorSample.gpu.gpus (sorted by index)
  gpus: { load: number; memUsedMb: number }[];
}

export interface MonitorSample {
  t: number;
  cpu: CpuInfo | null;
  gpu: GPUApiResponse;
}

export interface MonitorInit extends MonitorSample {
  history: MonitorHistoryPoint[];
}

/**
 * Training configuration
 */

export interface NetworkConfig {
  type: string;
  linear: number;
  linear_alpha: number;
  conv: number;
  conv_alpha: number;
  lokr_full_rank: boolean;
  lokr_factor: number;
  network_kwargs: {
    ignore_if_contains: string[];
  };
  transformer_only?: boolean;
  pretrained_lora_path?: string | null;
}

export interface SaveConfig {
  dtype: string;
  save_every: number;
  max_step_saves_to_keep: number;
  save_format: string;
  push_to_hub: boolean;
}

export interface DatasetConfig {
  batch_size?: number;
  folder_path: string;
  mask_path: string | null;
  mask_min_value: number;
  default_caption: string;
  caption_ext: string;
  caption_dropout_rate: number;
  shuffle_tokens?: boolean;
  is_reg: boolean;
  network_weight: number;
  cache_latents_to_disk?: boolean;
  resolution: number[];
  controls: string[];
  control_path?: string | null;
  num_frames: number;
  shrink_video_to_frames: boolean;
  do_i2v?: boolean;
  do_audio?: boolean;
  audio_normalize?: boolean;
  audio_preserve_pitch?: boolean;
  fps?: number;
  flip_x: boolean;
  flip_y: boolean;
  num_repeats?: number;
  buckets?: boolean;
  cache_latents?: boolean;
  augmentations?: { method: string; params?: Record<string, unknown> }[] | null;
  shuffle_augmentations?: boolean;
  timestep_type?: string | null;
  min_denoising_steps?: number | null;
  max_denoising_steps?: number | null;
  timestep_weights?: number[] | null;
  diffusion_loss_weight?: number;
  depth_loss_weight?: number;
  depth_loss_min_t?: number;
  depth_loss_max_t?: number;
  identity_loss_weight?: number;
  identity_loss_min_t?: number;
  identity_loss_max_t?: number;
  identity_loss_min_cos?: number;
  landmark_loss_weight?: number;
  body_proportion_loss_weight?: number;
  body_proportion_loss_min_t?: number;
  body_proportion_loss_max_t?: number;
  body_shape_loss_weight?: number;
  body_shape_loss_min_t?: number;
  body_shape_loss_max_t?: number;
  normal_loss_weight?: number;
  normal_loss_min_t?: number;
  normal_loss_max_t?: number;
  vae_anchor_loss_weight?: number;
  vae_anchor_loss_min_t?: number;
  vae_anchor_loss_max_t?: number;
  face_suppression_weight?: number;
  face_suppression_expand?: number;
  face_suppression_soft?: boolean;
  latent_perceptual_loss_weight?: number;
  latent_perceptual_loss_min_t?: number;
  latent_perceptual_loss_max_t?: number;
  perceptual_restrict_to_body?: boolean;
  loss_split?: 'diffusion_depth' | 'sum' | null;
  control_path_1?: string | null;
  control_path_2?: string | null;
  control_path_3?: string | null;
  auto_frame_count?: boolean;
}

export interface EMAConfig {
  use_ema: boolean;
  ema_decay: number;
}

export interface ValidationItem {
  image_path: string;
  prompt: string;
}

export interface ValidationConfig {
  validation_items: ValidationItem[];
  resolution: number;
  validate_every_n_steps: number;
  validation_sigmas?: number[];
}

export interface TrainConfig {
  batch_size: number;
  bypass_guidance_embedding?: boolean;
  steps: number;
  gradient_accumulation: number;
  train_unet: boolean;
  train_text_encoder: boolean;
  gradient_checkpointing: boolean;
  noise_scheduler: string;
  timestep_type: string;
  content_or_style: string;
  min_denoising_steps?: number;
  max_denoising_steps?: number;
  num_train_timesteps?: number;
  first_timestep_chance?: number;
  latent_perceptual_loss_weight?: number;
  latent_perceptual_loss_min_t?: number;
  latent_perceptual_loss_max_t?: number;
  loss_split?: 'diffusion_depth' | 'sum' | null;
  optimizer: string;
  lr: number;
  ema_config?: EMAConfig;
  dtype: string;
  unload_text_encoder: boolean;
  cache_text_embeddings: boolean;
  optimizer_params: {
    weight_decay: number;
  };
  skip_first_sample: boolean;
  force_first_sample: boolean;
  disable_sampling: boolean;
  diff_output_preservation: boolean;
  diff_output_preservation_multiplier: number;
  diff_output_preservation_class: string;
  blank_prompt_preservation?: boolean;
  blank_prompt_preservation_multiplier?: number;
  switch_boundary_every: number;
  loss_type: 'mse' | 'mae' | 'wavelet' | 'stepped';
  do_differential_guidance?: boolean;
  differential_guidance_scale?: number;
  pool_datasets?: boolean;
  audio_loss_multiplier?: number;
  max_loss?: number | null;
  validation_config?: ValidationConfig;
  do_guidance_loss?: boolean;
  guidance_loss_target?: number;
}

export interface QuantizeKwargsConfig {
  exclude: string[];
}

export interface ModelConfig {
  name_or_path: string;
  quantize: boolean;
  quantize_te: boolean;
  qtype: string;
  qtype_te: string;
  quantize_kwargs?: QuantizeKwargsConfig;
  arch: string;
  low_vram: boolean;
  model_kwargs: { [key: string]: any };
  layer_offloading?: boolean;
  layer_offloading_transformer_percent?: number;
  layer_offloading_text_encoder_percent?: number;
  assistant_lora_path?: string;
  unconditional_lora_path?: string;
  compile?: boolean;
  block_compile?: boolean;
  compile_mode?: 'default' | 'max-autotune' | 'fastest';
  compile_fullgraph?: boolean;
  compile_dynamic?: boolean;
  cache_size_limit?: number;
}

export interface SampleItem {
  prompt: string;
  width?: number;
  height?: number;
  neg?: string;
  seed?: number;
  guidance_scale?: number;
  sample_steps?: number;
  fps?: number;
  num_frames?: number;
  duration?: number;
  ctrl_img?: string | null;
  ctrl_idx?: number;
  network_multiplier?: number;
  ctrl_img_1?: string | null;
  ctrl_img_2?: string | null;
  ctrl_img_3?: string | null;
}

export interface SampleConfig {
  sampler: string;
  sample_every: number;
  sample_start_step: number;
  width: number;
  height: number;
  prompts?: string[];
  samples: SampleItem[];
  neg: string;
  seed: number;
  walk_seed: boolean;
  guidance_scale: number;
  sample_steps: number;
  num_frames: number;
  fps: number;
  duration?: number;
}

export interface LoggingConfig {
  log_every: number;
  use_ui_logger: boolean;
}

export interface SliderConfig {
  guidance_strength?: number;
  anchor_strength?: number;
  positive_prompt?: string;
  negative_prompt?: string;
  target_class?: string;
  anchor_class?: string | null;
}

export interface ProcessConfig {
  type: string;
  sqlite_db_path?: string;
  training_folder: string;
  performance_log_every: number;
  trigger_word: string | null;
  device: string;
  network?: NetworkConfig;
  slider?: SliderConfig;
  save: SaveConfig;
  datasets: DatasetConfig[];
  train: TrainConfig;
  logging: LoggingConfig;
  model: ModelConfig;
  sample: SampleConfig;
  face_id?: { [key: string]: any };
  depth_consistency?: { [key: string]: any };
  subject_mask?: { [key: string]: any };
}

export interface ConfigObject {
  name: string;
  process: ProcessConfig[];
}

export interface MetaConfig {
  name: string;
  version: string;
}

export interface JobConfig {
  job: string;
  config: ConfigObject;
  meta: MetaConfig;
}

// A LoRA published on the hub, offered for a specific model option. `path` is a
// 'org/repo/path_to/file.safetensors' reference; the backend looks for it under
// the models folder first and downloads it into MODELS_PATH/loras if missing.
export interface CloudLora {
  path: string;
  name: string;
  description?: string;
}

export interface CaptionLora {
  path: string;
  name: string;
  strength: number;
}

export interface CaptionProcessConfig {
  type: string;
  sqlite_db_path?: string;
  device: string;
  caption: {
    model_name_or_path: string;
    model_name_or_path2?: string;
    dtype: string;
    quantize: boolean;
    qtype: string;
    low_vram: boolean;
    extensions: string[];
    path_to_caption: string;
    recaption: boolean;
    compile?: boolean;
    caption_prompt?: string;
    max_res?: number;
    max_new_tokens?: number;
    fixed_caption?: string;
    caption_format?: string;
    extract_vocals_before_transcribe?: boolean;
    keep_timestamps?: boolean;
    caption_extension?: string;
    thinking?: boolean;
    batch_size?: number;
    layer_offloading?: boolean;
    layer_offloading_percent?: number;
    loras?: CaptionLora[];
    // Qwen3.8 captioner
    mtp?: boolean;
    mtp_depth?: number;
    cuda_graph?: boolean;
    vision_bf16?: boolean;
    video_fps?: number;
    system_prompt?: string;
  }
}

export interface CaptionConfigObject {
  name: string;
  process: CaptionProcessConfig[];
}

export interface CaptionJobConfig {
  job: string;
  config: CaptionConfigObject;
}

export interface ConfigDoc {
  title: string | React.ReactNode;
  description: React.ReactNode;
}

export interface SelectOption {
  readonly value: string;
  readonly label: string;
}
export interface GroupedSelectOption {
  readonly label: string;
  readonly options: SelectOption[];
}

export type JobStatus = 'queued' | 'running' | 'stopping' | 'stopped' | 'completed' | 'error';

export interface JobNotesSummary {
  summary: string;
  excerpt: string;
  hasNotes: boolean;
}
