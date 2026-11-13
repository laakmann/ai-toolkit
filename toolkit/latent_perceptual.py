"""Capability checks for the optional E-LatentLPIPS perceptual loss.

E-LatentLPIPS ships metrics for 4-channel latents (SD1.5/SD2.1/SDXL) and
16-channel latents (SD3/FLUX).  The trainer can unpack Flux2-style
128-channel latents into that space, but a model that packs its latents in a
different order cannot use the metric meaningfully.
"""

from __future__ import annotations

# Ideogram4 packs 128 channels patch-major (ph, pw, channel) while the
# Flux2-style unpacking used by the loss is channel-major (channel, ph, pw).
# Comparing the two would compute a perceptual distance on scrambled data.
UNSUPPORTED_ARCHS = frozenset({"ideogram4"})


def is_supported_arch(arch: str) -> bool:
    """Return whether the latent perceptual loss can use ``arch`` latents."""
    return str(arch or "").split(":")[0] not in UNSUPPORTED_ARCHS
