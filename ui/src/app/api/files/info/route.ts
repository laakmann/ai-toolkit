import { NextRequest, NextResponse } from 'next/server';
import { FileAccessError, resolveAllowedFile } from '@/server/fileAccess';
import { readSafetensorsInfo, SafetensorsError } from '@/server/safetensors';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { resolvedFilePath } = await resolveAllowedFile(body?.filePath);
    const info = await readSafetensorsInfo(resolvedFilePath);
    return NextResponse.json(info);
  } catch (error) {
    if (error instanceof FileAccessError || error instanceof SafetensorsError) {
      return new NextResponse(error.message, { status: error.status });
    }
    console.error('Error reading safetensors info:', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}
