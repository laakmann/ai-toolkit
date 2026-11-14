import { NextRequest, NextResponse } from 'next/server';
import { FileAccessError, resolveAllowedFile } from '@/server/fileAccess';
import { readSafetensorsInfo, SafetensorsError } from '@/server/safetensors';
import { summarizeLoraTensors } from '@/utils/loraInfo';

function metadataString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    const parsed = JSON.parse(trimmed);
    if (typeof parsed === 'string') return parsed;
  } catch {
    // plain string metadata
  }
  return trimmed;
}

export async function POST(request: NextRequest) {
  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const filePath =
      body && typeof body === 'object' && 'filePath' in body ? (body as { filePath?: unknown }).filePath : undefined;
    const { resolvedFilePath, stat } = await resolveAllowedFile(filePath);
    const isSafetensors = resolvedFilePath.toLowerCase().endsWith('.safetensors');

    if (!isSafetensors) {
      return NextResponse.json({
        path: resolvedFilePath,
        exists: true,
        isFile: true,
        isSafetensors: false,
        fileSize: stat.size,
        rank: null,
        ranks: [],
        networkType: null,
        tensorCount: 0,
        baseModel: null,
      });
    }

    const info = await readSafetensorsInfo(resolvedFilePath);
    const summary = summarizeLoraTensors(info.tensors, info.metadata);

    return NextResponse.json({
      path: resolvedFilePath,
      exists: true,
      isFile: true,
      isSafetensors: true,
      fileSize: info.fileSize,
      ...summary,
      tensorCount: info.tensorCount,
      baseModel:
        metadataString(info.metadata.ss_base_model_version) ??
        metadataString(info.metadata.ss_base_model) ??
        metadataString(info.metadata.ss_sd_model_name),
    });
  } catch (error) {
    if (error instanceof FileAccessError || error instanceof SafetensorsError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('Error reading LoRA info:', error);
    return NextResponse.json({ error: 'Failed to read LoRA info' }, { status: 500 });
  }
}
