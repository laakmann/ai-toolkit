#!/usr/bin/env python3
"""Tests for integer + fractional num_repeats handling.

Run: .venv/bin/python testing/test_num_repeats.py
"""
import math
import os
import sys
from types import SimpleNamespace

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from toolkit.data_loader import build_repeat_weights, repeats_to_copies_and_weight
from toolkit.config_modules import DatasetConfig, preprocess_dataset_raw_config


def test_repeat_split():
    cases = {
        0.5: (1, 0.5),
        1: (1, 1.0),
        1.5: (1, 1.5),
        2: (2, 1.0),
        2.5: (2, 1.25),
        3: (3, 1.0),
    }
    for repeats, expected in cases.items():
        copies, weight = repeats_to_copies_and_weight(repeats)
        assert (copies, weight) == expected, (repeats, copies, weight, expected)
        # copies * weight is the expected number of draws per image
        assert math.isclose(copies * weight, repeats)
    print("  PASS test_repeat_split")


def test_build_repeat_weights():
    item_half = SimpleNamespace(repeat_weight=0.5)
    item_full = SimpleNamespace(repeat_weight=1.0)
    item_one_five = SimpleNamespace(repeat_weight=1.5)

    plain = SimpleNamespace(
        dataset_config=SimpleNamespace(buckets=False),
        file_list=[item_half, item_full],
    )
    assert build_repeat_weights([plain]) == [0.5, 1.0]

    bucketed = SimpleNamespace(
        dataset_config=SimpleNamespace(buckets=True),
        file_list=[item_half, item_one_five, item_full, item_full],
        batch_indices=[[0, 1], [2, 3]],
    )
    # bucket weights are the mean of their items
    assert build_repeat_weights([bucketed]) == [1.0, 1.0]
    print("  PASS test_build_repeat_weights")


def test_dataset_config_accepts_fractional():
    assert DatasetConfig(folder_path="x", num_repeats=1.5).num_repeats == 1.5
    assert DatasetConfig(folder_path="x", num_repeats=2).num_repeats == 2.0
    assert DatasetConfig(folder_path="x").num_repeats == 1.0
    assert DatasetConfig(folder_path="x", num_repeats=None).num_repeats == 1.0
    print("  PASS test_dataset_config_accepts_fractional")


def test_dataset_config_rejects_invalid():
    bad_values = [[1, 2], 0, -1, float("nan"), float("inf"), "2", True]
    for value in bad_values:
        try:
            DatasetConfig(folder_path="x", num_repeats=value)
        except ValueError:
            continue
        raise AssertionError(f"expected ValueError for num_repeats={value!r}")
    print("  PASS test_dataset_config_rejects_invalid")


def test_preprocess_pairs_repeats_with_resolutions():
    raw = [
        {
            "folder_path": "x",
            "resolution": [512, 768, 1024],
            "num_repeats": [16, 4, 1],
        }
    ]
    out = preprocess_dataset_raw_config(raw)
    pairs = [(item["resolution"], item["num_repeats"]) for item in out]
    assert pairs == [(512, 16), (768, 4), (1024, 1)], pairs
    print("  PASS test_preprocess_pairs_repeats_with_resolutions")


if __name__ == "__main__":
    print("=== num_repeats ===")
    test_repeat_split()
    test_build_repeat_weights()
    test_dataset_config_accepts_fractional()
    test_dataset_config_rejects_invalid()
    test_preprocess_pairs_repeats_with_resolutions()
    print("\n=== ALL TESTS PASSED ===")
