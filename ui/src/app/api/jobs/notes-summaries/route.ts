import { NextRequest, NextResponse } from 'next/server';
import { cached } from '@/server/apiCache';
import { getJobNotesSummaries } from '@/server/jobNotes';

const MAX_IDS = 1000;

function parseIDs(rawIDs: unknown): string[] {
  const ids = Array.isArray(rawIDs) ? rawIDs : typeof rawIDs === 'string' ? rawIDs.split(',') : [];
  return Array.from(new Set(ids.map(id => (typeof id === 'string' ? id.trim() : '')).filter(Boolean))).sort();
}

async function summarize(ids: string[]) {
  if (ids.length === 0) {
    return NextResponse.json({});
  }
  if (ids.length > MAX_IDS) {
    return NextResponse.json({ error: `Too many job IDs (max ${MAX_IDS})` }, { status: 400 });
  }

  try {
    // The queue polls this alongside the jobs list. Keep a short cache so focus
    // refreshes and overlapping polls do not re-read every notes file.
    const summaries = await cached('job-notes-summaries', () => getJobNotesSummaries(ids), 5000, { ids });
    return NextResponse.json(summaries);
  } catch (error) {
    console.error('Error reading job notes summaries:', error);
    return NextResponse.json({ error: 'Failed to read job notes summaries' }, { status: 500 });
  }
}

/** GET is convenient for debugging; the queue uses POST to avoid URL limits. */
export async function GET(request: NextRequest) {
  return summarize(parseIDs(new URL(request.url).searchParams.get('ids')));
}

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const ids = body && typeof body === 'object' && 'ids' in body ? parseIDs((body as { ids?: unknown }).ids) : [];
  return summarize(ids);
}
