#!/usr/bin/env python3
"""Tests for the latent perceptual capability guards.

Run: .venv/bin/python testing/test_latent_perceptual.py
"""
import os
import sys
from types import SimpleNamespace

import torch

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from toolkit.latent_perceptual import is_supported_arch
from extensions_built_in.sd_trainer.SDTrainer import SDTrainer


def _trainer(arch: str) -> SDTrainer:
    trainer = object.__new__(SDTrainer)
    trainer.sd = SimpleNamespace(arch=arch)
    trainer.train_config = SimpleNamespace(latent_perceptual_loss_weight=0.1)
    trainer.device_torch = torch.device('cpu')
    trainer.latent_perceptual_model = None
    trainer._latent_perceptual_import_failed = False
    trainer._latent_perceptual_unsupported_warned = False
    trainer._latent_perceptual_shape_warned = False
    return trainer


def test_arch_support():
    assert is_supported_arch('flux')
    assert is_supported_arch('flux2')
    assert is_supported_arch('sdxl')
    assert is_supported_arch(None)
    assert not is_supported_arch('ideogram4')
    assert not is_supported_arch('ideogram4:fp8')
    print("  PASS test_arch_support")


def test_unsupported_arch_returns_zero_without_loading_model():
    trainer = _trainer('ideogram4')
    latents = torch.zeros(1, 128, 8, 8)
    loss = trainer._compute_latent_perceptual_loss(latents, latents, torch.zeros(1), batch=None)
    assert loss.item() == 0.0
    assert trainer._latent_perceptual_unsupported_warned
    assert trainer.latent_perceptual_model is None
    print("  PASS test_unsupported_arch_returns_zero_without_loading_model")


def test_non_4d_latents_return_zero():
    trainer = _trainer('wan21')
    latents = torch.zeros(1, 16, 4, 8, 8)
    loss = trainer._compute_latent_perceptual_loss(latents, latents, torch.zeros(1), batch=None)
    assert loss.item() == 0.0
    assert trainer._latent_perceptual_shape_warned
    print("  PASS test_non_4d_latents_return_zero")


if __name__ == "__main__":
    print("=== Latent perceptual guards ===")
    test_arch_support()
    test_unsupported_arch_returns_zero_without_loading_model()
    test_non_4d_latents_return_zero()
    print("\n=== ALL TESTS PASSED ===")
