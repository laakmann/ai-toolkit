"""Dataset-level timestep sampling weights.

``datasets[].timestep_weights`` is a short list of relative weights such as
``[10, 4, 4, 1, 0]``. The active timestep index range is split into
``len(weights)`` contiguous equal-count buckets (quantiles of the scheduler's
native schedule). Buckets are drawn with probability proportional to their
weight, and every timestep inside a bucket is equally likely.

Index 0 is the noisiest end of the schedule (for flow-matching that is
``t=1000``); the last entry is the cleanest (``t=1``).
"""
from __future__ import annotations

import math
from numbers import Real
from typing import List, Optional, Sequence

import torch

__all__ = [
    "validate_timestep_weights",
    "build_quantile_pmf",
    "sample_timestep_indices",
]


def validate_timestep_weights(
    value: Optional[Sequence[Real]],
    field_name: str = "timestep_weights",
) -> Optional[List[float]]:
    """Validate and normalize a ``timestep_weights`` config value.

    Returns ``None`` when the field is absent. Raises ``ValueError`` for
    malformed values so config problems fail before the training loop starts.
    """
    if value is None:
        return None
    if isinstance(value, (str, bytes)) or not isinstance(value, (list, tuple)):
        raise ValueError(
            f"{field_name} must be a list of non-negative numbers, "
            f"got {type(value).__name__}"
        )
    if len(value) == 0:
        raise ValueError(f"{field_name} must contain at least one value")

    out: List[float] = []
    for i, raw in enumerate(value):
        # bool is an int subclass, but True/False almost certainly means a
        # typo in the config rather than a 1.0 / 0.0 weight.
        if isinstance(raw, bool) or not isinstance(raw, Real):
            raise ValueError(f"{field_name}[{i}] must be a number, got {raw!r}")
        weight = float(raw)
        if not math.isfinite(weight):
            raise ValueError(f"{field_name}[{i}] must be finite, got {raw!r}")
        if weight < 0.0:
            raise ValueError(f"{field_name}[{i}] must be >= 0, got {raw!r}")
        out.append(weight)

    if not any(weight > 0.0 for weight in out):
        raise ValueError(f"{field_name} must contain at least one positive value")

    return out


def build_quantile_pmf(
    weights: Sequence[Real],
    min_index: int,
    max_index: int,
    device: Optional[torch.device] = None,
) -> torch.Tensor:
    """Build a normalized PMF over schedule indices ``[min_index, max_index]``.

    The range is divided into ``len(weights)`` contiguous, nearly-equal-count
    buckets. Each bucket's total mass is its weight, distributed uniformly
    across the timesteps in that bucket. Empty buckets are ignored; if that
    leaves no probability mass, a ``ValueError`` is raised.
    """
    if min_index > max_index:
        raise ValueError(
            f"timestep range is empty: min_index={min_index}, max_index={max_index}"
        )

    num_indices = int(max_index) - int(min_index) + 1
    w = torch.as_tensor(weights, dtype=torch.float64, device=device)
    if w.ndim != 1 or w.numel() == 0:
        raise ValueError("timestep_weights must be a non-empty 1-D sequence")
    if not torch.isfinite(w).all() or torch.any(w < 0):
        raise ValueError("timestep_weights must be finite and non-negative")

    num_buckets = w.numel()
    # Bucket boundaries in [0, num_indices). This gives bucket sizes that
    # differ by at most one and always cover the full active range.
    starts = torch.floor(
        torch.arange(num_buckets, dtype=torch.float64, device=device)
        * num_indices
        / num_buckets
    ).to(torch.long)
    ends = torch.floor(
        torch.arange(1, num_buckets + 1, dtype=torch.float64, device=device)
        * num_indices
        / num_buckets
    ).to(torch.long)
    counts = ends - starts

    # Repeat each bucket weight once per index it contains, then divide by the
    # bucket size so the bucket's *total* mass equals its weight.
    bucket_weights = torch.repeat_interleave(w, counts)
    bucket_sizes = torch.repeat_interleave(counts.to(w.dtype), counts)
    pmf = bucket_weights / bucket_sizes

    total = pmf.sum()
    if not torch.isfinite(total) or total <= 0:
        raise ValueError(
            "timestep_weights has no probability mass inside the active range "
            f"[{min_index}, {max_index}]. Use fewer weights or give a "
            "non-empty bucket a positive value."
        )

    return (pmf / total).to(torch.float32)


def sample_timestep_indices(
    weights: Sequence[Real],
    count: int,
    min_index: int,
    max_index: int,
    device: Optional[torch.device] = None,
    generator: Optional[torch.Generator] = None,
) -> torch.Tensor:
    """Draw ``count`` schedule indices according to ``weights``.

    Returns a ``long`` tensor of absolute schedule indices in
    ``[min_index, max_index]``.
    """
    if count <= 0:
        return torch.empty(0, dtype=torch.long, device=device)

    pmf = build_quantile_pmf(weights, min_index, max_index, device=device)
    indices = torch.multinomial(
        pmf,
        num_samples=int(count),
        replacement=True,
        generator=generator,
    )
    return indices.to(torch.long) + int(min_index)
