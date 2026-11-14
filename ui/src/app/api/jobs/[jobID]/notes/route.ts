import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs';
import { invalidateCache } from '@/server/apiCache';
import { getJobNotesPath, readJobNotes } from '@/server/jobNotes';

export async function GET(request: NextRequest, { params }: { params: { jobID: string } }) {
  const { jobID } = await params;
  const content = await readJobNotes(jobID);

  if (content === null) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 });
  }

  return NextResponse.json({ content });
}

export async function POST(request: NextRequest, { params }: { params: { jobID: string } }) {
  const { jobID } = await params;
  const notesPath = await getJobNotesPath(jobID);

  if (!notesPath) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 });
  }

  const body = await request.json();
  const content = typeof body?.content === 'string' ? body.content : '';

  try {
    // the job folder may not exist yet if the job has never run
    await fs.promises.mkdir(path.dirname(notesPath), { recursive: true });
    await fs.promises.writeFile(notesPath, content, 'utf-8');
    // Keep queue summaries from serving the previous text after an edit.
    invalidateCache('job-notes-summaries');
  } catch (error) {
    console.error('Error saving notes file:', error);
    return NextResponse.json({ error: 'Error saving notes file' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
