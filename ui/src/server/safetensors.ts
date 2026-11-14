import fs from 'fs';

// safetensors header: u64 LE byte length, then that many bytes of JSON.
const MAX_HEADER_BYTES = 256 * 1024 * 1024;

const DTYPE_BYTES: Record<string, number> = {
  F64: 8,
  I64: 8,
  U64: 8,
  F32: 4,
  I32: 4,
  U32: 4,
  F16: 2,
  BF16: 2,
  I16: 2,
  U16: 2,
  F8_E4M3: 1,
  F8_E5M2: 1,
  F8_E8M0: 1,
  I8: 1,
  U8: 1,
  BOOL: 1,
  F4: 0.5,
  U4: 0.5,
  I4: 0.5,
};

export class SafetensorsError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = 'SafetensorsError';
    this.status = status;
  }
}

export interface SafetensorsTensorInfo {
  name: string;
  dtype: string;
  shape: number[];
  numel: number;
  bytes: number;
}

export interface SafetensorsInfo {
  filePath: string;
  fileSize: number;
  headerSize: number;
  metadata: Record<string, string>;
  tensors: SafetensorsTensorInfo[];
  tensorCount: number;
  totalParams: number;
  totalBytes: number;
  dtypeCounts: Record<string, { count: number; numel: number; bytes: number }>;
}

/** Read the header (not the tensor data) of a safetensors file. */
export async function readSafetensorsInfo(filePath: string): Promise<SafetensorsInfo> {
  let stat: fs.Stats;
  try {
    stat = await fs.promises.stat(filePath);
  } catch {
    throw new SafetensorsError('File not found', 404);
  }

  if (!stat.isFile()) {
    throw new SafetensorsError('Not a file', 400);
  }
  if (stat.size < 8) {
    throw new SafetensorsError('Not a safetensors file', 400);
  }

  let header: Record<string, any>;
  let headerSize: number;
  const handle = await fs.promises.open(filePath, 'r');
  try {
    const lenBuf = Buffer.alloc(8);
    await handle.read(lenBuf, 0, 8, 0);
    const headerLen = lenBuf.readBigUInt64LE(0);
    if (headerLen > BigInt(MAX_HEADER_BYTES) || headerLen > BigInt(stat.size - 8)) {
      throw new SafetensorsError('Not a safetensors file (bad header length)', 400);
    }
    headerSize = Number(headerLen);
    const headerBuf = Buffer.alloc(headerSize);
    await handle.read(headerBuf, 0, headerSize, 8);
    header = JSON.parse(headerBuf.toString('utf8'));
  } catch (error) {
    if (error instanceof SafetensorsError) throw error;
    throw new SafetensorsError('Not a safetensors file (unparseable header)', 400);
  } finally {
    await handle.close();
  }

  if (typeof header !== 'object' || header === null || Array.isArray(header)) {
    throw new SafetensorsError('Not a safetensors file (unparseable header)', 400);
  }

  const metadata: Record<string, string> = header.__metadata__ ?? {};
  const tensors: SafetensorsTensorInfo[] = [];
  const dtypeCounts: Record<string, { count: number; numel: number; bytes: number }> = {};
  let totalParams = 0;
  let totalBytes = 0;

  for (const [name, info] of Object.entries(header)) {
    if (name === '__metadata__') continue;
    const tensor = info as { dtype: string; shape: number[]; data_offsets?: [number, number] };
    const shape = Array.isArray(tensor.shape) ? tensor.shape : [];
    const numel = shape.reduce((a, b) => a * b, 1);
    const bytes = tensor.data_offsets
      ? tensor.data_offsets[1] - tensor.data_offsets[0]
      : numel * (DTYPE_BYTES[tensor.dtype] ?? 0);
    tensors.push({ name, dtype: tensor.dtype, shape, numel, bytes });
    totalParams += numel;
    totalBytes += bytes;
    const dtype = (dtypeCounts[tensor.dtype] ??= { count: 0, numel: 0, bytes: 0 });
    dtype.count += 1;
    dtype.numel += numel;
    dtype.bytes += bytes;
  }
  tensors.sort((a, b) => a.name.localeCompare(b.name));

  return {
    filePath,
    fileSize: stat.size,
    headerSize,
    metadata,
    tensors,
    tensorCount: tensors.length,
    totalParams,
    totalBytes,
    dtypeCounts,
  };
}
