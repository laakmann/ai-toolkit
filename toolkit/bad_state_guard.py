import os
import random
import math
from typing import Dict, List, Tuple

import torch
from PIL import Image
from torchvision.transforms import functional as TF

from toolkit.data_transfer_object.data_loader import DataLoaderBatchDTO
from toolkit.stable_diffusion_model import StableDiffusion


VALID_IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp", ".bmp"}


class BadStatePool:
    def __init__(
        self,
        path,
        sd: StableDiffusion,
        cache_latents=True,
        match_strategy="nearest_aspect",
        resize_mode="contain",
    ):
        if path is None:
            raise ValueError("bad_state_guard.path must be set when bad_state_guard is enabled")
        if not os.path.isdir(path):
            raise ValueError(f"bad_state_guard.path does not exist or is not a directory: {path}")
        if match_strategy not in ["nearest_aspect", "random"]:
            raise ValueError(f"Unknown bad_state_guard.match_strategy: {match_strategy}")
        if resize_mode not in ["contain", "cover", "stretch"]:
            raise ValueError(f"Unknown bad_state_guard.resize_mode: {resize_mode}")

        self.path = path
        self.sd = sd
        self.cache_latents = cache_latents
        self.match_strategy = match_strategy
        self.resize_mode = resize_mode
        self.vae_scale_factor = self._resolve_vae_scale_factor()
        self.image_paths = self._get_image_paths(path)
        self.aspect_ratio_by_path: Dict[str, float] = self._build_aspect_ratio_map(self.image_paths)
        self.latent_cache: Dict[Tuple[str, int, int], torch.Tensor] = {}

    def _resolve_vae_scale_factor(self) -> int:
        vae = getattr(self.sd, "vae", None)
        config = getattr(vae, "config", None)

        if config is not None:
            try:
                block_out_channels = config["block_out_channels"]
                return 2 ** (len(block_out_channels) - 1)
            except Exception:
                block_out_channels = getattr(config, "block_out_channels", None)
                if block_out_channels is not None:
                    return 2 ** (len(block_out_channels) - 1)

        scale = getattr(self.sd, "vae_scale_factor", None)
        if isinstance(scale, int) and scale > 0:
            return scale

        pipeline = getattr(self.sd, "pipeline", None)
        pipeline_scale = getattr(pipeline, "vae_scale_factor", None)
        if isinstance(pipeline_scale, int) and pipeline_scale > 0:
            return pipeline_scale

        return 8

    @staticmethod
    def _get_image_paths(path: str) -> List[str]:
        image_paths = []
        for root, _, files in os.walk(path):
            for filename in files:
                ext = os.path.splitext(filename)[1].lower()
                if ext in VALID_IMAGE_EXTENSIONS:
                    image_paths.append(os.path.join(root, filename))
        image_paths.sort()
        if len(image_paths) == 0:
            raise ValueError(f"No images found under bad_state_guard.path: {path}")
        return image_paths

    @staticmethod
    def _build_aspect_ratio_map(image_paths: List[str]) -> Dict[str, float]:
        aspect_ratio_by_path = {}
        for image_path in image_paths:
            with Image.open(image_path) as image:
                width, height = image.size
            if height == 0:
                continue
            aspect_ratio_by_path[image_path] = width / height
        return aspect_ratio_by_path

    def _pick_image_path(self, target_width: int, target_height: int) -> str:
        if self.match_strategy == "random":
            return random.choice(self.image_paths)

        target_aspect = target_width / target_height
        return min(
            self.image_paths,
            key=lambda image_path: abs(self.aspect_ratio_by_path.get(image_path, target_aspect) - target_aspect),
        )

    def _resize_image(self, image: Image.Image, target_width: int, target_height: int) -> Image.Image:
        if self.resize_mode == "stretch":
            return image.resize((target_width, target_height), resample=Image.Resampling.BICUBIC)

        source_width, source_height = image.size
        if source_width == 0 or source_height == 0:
            raise ValueError("Invalid image dimensions in bad_state_guard pool")

        if self.resize_mode == "contain":
            scale = min(target_width / source_width, target_height / source_height)
            resized_width = max(1, int(round(source_width * scale)))
            resized_height = max(1, int(round(source_height * scale)))
            resized = image.resize((resized_width, resized_height), resample=Image.Resampling.BICUBIC)
            canvas = Image.new("RGB", (target_width, target_height), (0, 0, 0))
            paste_x = (target_width - resized_width) // 2
            paste_y = (target_height - resized_height) // 2
            canvas.paste(resized, (paste_x, paste_y))
            return canvas

        scale = max(target_width / source_width, target_height / source_height)
        resized_width = max(1, int(round(source_width * scale)))
        resized_height = max(1, int(round(source_height * scale)))
        resized = image.resize((resized_width, resized_height), resample=Image.Resampling.BICUBIC)
        left = (resized_width - target_width) // 2
        top = (resized_height - target_height) // 2
        return resized.crop((left, top, left + target_width, top + target_height))

    def _load_image_tensor(self, image_path: str, target_width: int, target_height: int) -> torch.Tensor:
        with Image.open(image_path) as image:
            image = image.convert("RGB")
            image = self._resize_image(image, target_width=target_width, target_height=target_height)
        image_tensor = TF.to_tensor(image)
        image_tensor = (image_tensor * 2.0) - 1.0
        return image_tensor

    def _infer_patch_factor(self, target_latents: torch.Tensor) -> int:
        target_channels = int(target_latents.shape[1])

        ae_channels = None
        vae_params = getattr(self.sd.vae, "params", None)
        if vae_params is not None:
            ae_channels = getattr(vae_params, "z_channels", None)

        if ae_channels is None:
            config = getattr(self.sd.vae, "config", None)
            if config is not None:
                ae_channels = getattr(config, "latent_channels", None)
                if ae_channels is None:
                    try:
                        ae_channels = config["latent_channels"]
                    except Exception:
                        ae_channels = None

        if isinstance(ae_channels, int) and ae_channels > 0 and target_channels % ae_channels == 0:
            ratio = target_channels // ae_channels
            patch = int(math.sqrt(ratio))
            if patch > 1 and (patch * patch) == ratio:
                return patch

        return 1

    def _encode_bad_state_latent(self, image_path: str, latent_h: int, latent_w: int, patch_factor: int = 1) -> torch.Tensor:
        pixel_h = latent_h * self.vae_scale_factor * patch_factor
        pixel_w = latent_w * self.vae_scale_factor * patch_factor
        image_tensor = self._load_image_tensor(image_path, target_width=pixel_w, target_height=pixel_h)
        batched_image = image_tensor.unsqueeze(0).to(self.sd.device_torch, dtype=self.sd.torch_dtype)
        with torch.no_grad():
            bad_latent = self.sd.encode_images(batched_image).detach()
        return bad_latent

    def get_latents_like(self, target_latents: torch.Tensor, batch: DataLoaderBatchDTO) -> torch.Tensor:
        _ = batch
        if target_latents.shape[0] != 1:
            raise ValueError("bad_state_guard currently supports batch_size == 1")

        latent_h = target_latents.shape[-2]
        latent_w = target_latents.shape[-1]
        target_dtype = target_latents.dtype
        target_device = target_latents.device
        patch_factor = self._infer_patch_factor(target_latents)

        image_path = self._pick_image_path(latent_w, latent_h)
        cache_key = (image_path, latent_h, latent_w)
        bad_latent = None
        if self.cache_latents:
            bad_latent = self.latent_cache.get(cache_key, None)

        if bad_latent is None:
            bad_latent = self._encode_bad_state_latent(image_path, latent_h, latent_w, patch_factor=patch_factor)
            if self.cache_latents:
                self.latent_cache[cache_key] = bad_latent.detach().cpu()

        return bad_latent.to(target_device, dtype=target_dtype).detach()
