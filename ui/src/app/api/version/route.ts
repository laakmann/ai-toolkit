import { NextResponse } from 'next/server';
import { getAppVersion } from '@/server/appVersion';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json(
    { version: getAppVersion() },
    { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } },
  );
}
