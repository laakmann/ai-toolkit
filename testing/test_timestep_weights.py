#!/usr/bin/env python3
"""Tests for per-dataset timestep sampling weights.

Covers:
  - validate_timestep_weights(): accepted / rejected config values
  - build_quantile_pmf(): bucket boundaries, bucket masses, restricted ranges
  - sample_timestep_indices(): draws stay inside the requested buckets/range
  - DatasetConfig.timestep_weights: storage + validation at config load

Run: .venv/bin/python testing/test_timestep_weights.py
"""
import math
import os
import sys

import torch

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from toolkit.timestep_weighing.quantile_weights import (
    build_quantile_pmf,
    sample_timestep_indices,
    timestep_weights_supported,
    validate_timestep_weights,
)


# ============================================================
# validate_timestep_weights
# ============================================================

def test_validate_accepts_none_and_valid_lists():
    assert validate_timestep_weights(None) is None
    assert validate_timestep_weights([10, 4, 4, 1, 0]) == [10.0, 4.0, 4.0, 1.0, 0.0]
    assert validate_timestep_weights([0.5, 1.25]) == [0.5, 1.25]
    assert validate_timestep_weights((2,)) == [2.0]
    print("  PASS test_validate_accepts_none_and_valid_lists")


def test_validate_rejects_bad_lists():
    bad_values = [
        [],
        [-1.0],
        [0.0, 0.0],
        [float("nan")],
        [float("inf")],
        "10,4,4,1,0",
        [True, 1],
        [1, "2"],
    ]
    for value in bad_values:
        try:
            validate_timestep_weights(value)
        except ValueError:
            continue
        raise AssertionError(f"expected ValueError for {value!r}")
    print("  PASS test_validate_rejects_bad_lists")


def test_fixed_step_modes_ignore_weights():
    for timestep_type in ("one_step", "two_step", "four_step", "eight_step"):
        assert timestep_weights_supported(timestep_type) is False
    for timestep_type in ("linear", "sigmoid", "shift", "weighted", "next_sample"):
        assert timestep_weights_supported(timestep_type) is True
    print("  PASS test_fixed_step_modes_ignore_weights")


# ============================================================
# build_quantile_pmf
# ============================================================

def test_uniform_weights_produce_uniform_pmf():
    pmf = build_quantile_pmf([1, 1, 1, 1, 1], 0, 999)
    assert pmf.shape == (1000,), pmf.shape
    assert torch.allclose(pmf, torch.full((1000,), 0.001), atol=1e-7)
    assert torch.allclose(pmf.sum(), torch.tensor(1.0), atol=1e-6)
    print("  PASS test_uniform_weights_produce_uniform_pmf")


def test_bucket_masses_match_weights():
    pmf = build_quantile_pmf([10, 4, 4, 1, 0], 0, 999)
    assert pmf.shape == (1000,), pmf.shape
    expected = torch.tensor([10, 4, 4, 1, 0], dtype=torch.float64) / 19.0
    for bucket in range(5):
        mass = pmf[bucket * 200:(bucket + 1) * 200].sum()
        assert math.isclose(mass.item(), expected[bucket].item(), abs_tol=1e-6), (
            bucket, mass.item(), expected[bucket].item()
        )
    # The zero-weight bucket must never be sampled.
    assert torch.all(pmf[800:] == 0.0)
    print("  PASS test_bucket_masses_match_weights")


def test_restricted_range_maps_buckets_onto_it():
    pmf = build_quantile_pmf([3, 1], 100, 299)
    assert pmf.shape == (200,), pmf.shape
    assert math.isclose(pmf[:100].sum().item(), 0.75, abs_tol=1e-6)
    assert math.isclose(pmf[100:].sum().item(), 0.25, abs_tol=1e-6)
    print("  PASS test_restricted_range_maps_buckets_onto_it")


def test_non_divisible_bucket_counts_cover_range():
    pmf = build_quantile_pmf([1, 1, 1], 0, 9)
    assert pmf.shape == (10,), pmf.shape
    # 10 indices over 3 buckets -> 3, 3, 4.
    for start, end in ((0, 3), (3, 6), (6, 10)):
        assert math.isclose(pmf[start:end].sum().item(), 1 / 3, abs_tol=1e-6)
    assert torch.allclose(pmf.sum(), torch.tensor(1.0), atol=1e-6)
    print("  PASS test_non_divisible_bucket_counts_cover_range")


def test_single_weight_is_uniform_over_range():
    pmf = build_quantile_pmf([7], 10, 19)
    assert pmf.shape == (10,), pmf.shape
    assert torch.allclose(pmf, torch.full((10,), 0.1), atol=1e-7)
    print("  PASS test_single_weight_is_uniform_over_range")


def test_empty_positive_bucket_raises():
    # 2 indices split across 3 buckets -> bucket 0 is empty. Putting the only
    # positive weight there leaves no probability mass.
    try:
        build_quantile_pmf([1, 0, 0], 0, 1)
    except ValueError:
        print("  PASS test_empty_positive_bucket_raises")
        return
    raise AssertionError("expected ValueError when all positive mass is in empty buckets")


# ============================================================
# sample_timestep_indices
# ============================================================

def test_sampling_respects_zero_weight_buckets():
    torch.manual_seed(0)
    low = sample_timestep_indices([1, 0], 1000, 0, 99)
    high = sample_timestep_indices([0, 1], 1000, 0, 99)
    assert low.dtype == torch.long
    assert high.dtype == torch.long
    assert low.min().item() >= 0 and low.max().item() < 50, (low.min(), low.max())
    assert high.min().item() >= 50 and high.max().item() <= 99, (high.min(), high.max())
    print("  PASS test_sampling_respects_zero_weight_buckets")


def test_sampling_respects_restricted_range():
    torch.manual_seed(0)
    indices = sample_timestep_indices([1, 1], 1000, 123, 456)
    assert indices.min().item() >= 123, indices.min()
    assert indices.max().item() <= 456, indices.max()
    print("  PASS test_sampling_respects_restricted_range")


# ============================================================
# DatasetConfig integration
# ============================================================

def test_dataset_config_stores_and_validates_weights():
    from toolkit.config_modules import DatasetConfig

    default = DatasetConfig(folder_path="/tmp/data")
    assert default.timestep_weights is None

    configured = DatasetConfig(
        folder_path="/tmp/data",
        timestep_weights=[10, 4, 4, 1.5, 0],
    )
    assert configured.timestep_weights == [10.0, 4.0, 4.0, 1.5, 0.0]

    try:
        DatasetConfig(folder_path="/tmp/data", timestep_weights=[0, 0])
    except ValueError:
        print("  PASS test_dataset_config_stores_and_validates_weights")
        return
    raise AssertionError("expected DatasetConfig to reject an all-zero timestep_weights")


if __name__ == "__main__":
    print("\n=== Validation ===")
    test_validate_accepts_none_and_valid_lists()
    test_validate_rejects_bad_lists()
    test_fixed_step_modes_ignore_weights()

    print("\n=== Quantile PMF ===")
    test_uniform_weights_produce_uniform_pmf()
    test_bucket_masses_match_weights()
    test_restricted_range_maps_buckets_onto_it()
    test_non_divisible_bucket_counts_cover_range()
    test_single_weight_is_uniform_over_range()
    test_empty_positive_bucket_raises()

    print("\n=== Sampling ===")
    test_sampling_respects_zero_weight_buckets()
    test_sampling_respects_restricted_range()

    print("\n=== DatasetConfig ===")
    test_dataset_config_stores_and_validates_weights()

    print("\n=== ALL TESTS PASSED ===")
