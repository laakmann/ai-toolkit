// Pure helpers for summarising a LoRA checkpoint header. Kept dependency-free so
// the API route and node tests can share it.

export interface LoraTensorLike {
  name: string;
  shape: number[];
}

export type LoraNetworkType = 'LoRA' | 'LoKr' | 'Other';

export interface LoraSummary {
  /** The most common rank in the file, or null when it cannot be inferred. */
  rank: number | null;
  /** Every rank found in the file, sorted ascending. */
  ranks: number[];
  /** Best-effort network type based on the tensor names. */
  networkType: LoraNetworkType | null;
}

const DOWN_SUFFIXES = ['.lora_down.weight', '.lora_a.weight', '.lora_a.default.weight'];
const UP_SUFFIXES = ['.lora_up.weight', '.lora_b.weight', '.lora_b.default.weight'];

function positiveInt(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) && value > 0 ? Math.trunc(value) : null;
  }
  if (typeof value !== 'string') return null;

  // safetensors metadata is all strings; some writers JSON-encode the value.
  const cleaned = value.trim().replace(/^"(.*)"$/, '$1');
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : null;
}

function chooseRank(ranks: number[]): number | null {
  if (ranks.length === 0) return null;

  const counts = new Map<number, number>();
  for (const rank of ranks) {
    counts.set(rank, (counts.get(rank) ?? 0) + 1);
  }

  let best: number | null = null;
  let bestCount = -1;
  for (const [rank, count] of counts) {
    // Ties are resolved toward the larger rank so a single low-rank adapter
    // does not make a mixed file look smaller than it is.
    if (count > bestCount || (count === bestCount && (best === null || rank > best))) {
      best = rank;
      bestCount = count;
    }
  }
  return best;
}

/**
 * Infer LoRA rank and network type from safetensors tensor metadata. Supports
 * the common kohya/toolkit (`lora_down`/`lora_up`) and PEFT (`lora_A`/`lora_B`)
 * naming schemes, and honours `ss_network_dim` when it is present.
 */
export function summarizeLoraTensors(tensors: LoraTensorLike[], metadata: Record<string, unknown> = {}): LoraSummary {
  const ranks: number[] = [];
  let hasLoraKeys = false;
  let hasLokrKeys = false;

  for (const tensor of tensors) {
    const name = tensor.name.toLowerCase();
    const shape = Array.isArray(tensor.shape) ? tensor.shape : [];

    if (name.includes('lokr_')) {
      hasLokrKeys = true;
      continue;
    }

    if (DOWN_SUFFIXES.some(suffix => name.endsWith(suffix))) {
      hasLoraKeys = true;
      const rank = positiveInt(shape[0]);
      if (rank !== null) ranks.push(rank);
      continue;
    }

    if (UP_SUFFIXES.some(suffix => name.endsWith(suffix))) {
      hasLoraKeys = true;
      // up weights are [out, rank] or [out, rank, k, k]
      const rank = positiveInt(shape[1]);
      if (rank !== null) ranks.push(rank);
    }
  }

  const uniqueRanks = Array.from(new Set(ranks)).sort((a, b) => a - b);
  const metadataRank = positiveInt(metadata.ss_network_dim);

  let networkType: LoraNetworkType | null = null;
  if (hasLoraKeys) networkType = 'LoRA';
  else if (hasLokrKeys) networkType = 'LoKr';
  else if (tensors.length > 0) networkType = 'Other';

  return {
    rank: metadataRank ?? chooseRank(ranks),
    ranks: uniqueRanks.length > 0 ? uniqueRanks : metadataRank !== null ? [metadataRank] : [],
    networkType,
  };
}
