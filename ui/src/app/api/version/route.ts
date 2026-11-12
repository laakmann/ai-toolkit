import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

function readVersion(): string {
  // The Next server runs with ui/ as its cwd; version.py sits one level up.
  // Fall back to the cwd itself for unusual launch layouts.
  const candidates = [path.join(process.cwd(), '..', 'version.py'), path.join(process.cwd(), 'version.py')];
  for (const file of candidates) {
    try {
      const text = fs.readFileSync(file, 'utf8');
      const match = text.match(/VERSION\s*=\s*["']([^"']+)["']/);
      if (match) return match[1];
    } catch {
      // try the next candidate
    }
  }
  return 'unknown';
}

export async function GET() {
  return NextResponse.json(
    { version: readVersion() },
    { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } },
  );
}
