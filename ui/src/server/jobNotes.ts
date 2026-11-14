import fs from 'fs';
import path from 'path';
import prisma from '@/server/prisma';
import { getTrainingFolder } from '@/server/settings';
import { getNotesExcerpt, getNotesSummary } from '@/utils/markdown';
import type { JobNotesSummary } from '@/types';

// Summaries only need the beginning of the file. Avoid reading a very large
// notes file in full on every queue poll.
const SUMMARY_READ_BYTES = 64 * 1024;

async function readTextHead(filePath: string, maxBytes: number): Promise<string> {
  const handle = await fs.promises.open(filePath, 'r');
  try {
    const buffer = Buffer.alloc(maxBytes);
    const { bytesRead } = await handle.read(buffer, 0, maxBytes, 0);
    return buffer.subarray(0, bytesRead).toString('utf-8');
  } finally {
    await handle.close();
  }
}

/** Path to a job's notes file, or null when the job no longer exists. */
export async function getJobNotesPath(jobID: string): Promise<string | null> {
  const job = await prisma.job.findUnique({
    where: { id: jobID },
    select: { name: true },
  });

  if (!job) return null;

  const trainingFolder = await getTrainingFolder();
  return path.join(trainingFolder, job.name, 'notes.md');
}

/** Read a job's notes. Missing files are treated as empty notes. */
export async function readJobNotes(jobID: string): Promise<string | null> {
  const notesPath = await getJobNotesPath(jobID);
  if (!notesPath) return null;

  try {
    return await fs.promises.readFile(notesPath, 'utf-8');
  } catch {
    return '';
  }
}

/**
 * Read summaries for a batch of jobs. Only the summary and a bounded excerpt
 * leave the server; the queue never receives full note bodies.
 */
export async function getJobNotesSummaries(jobIDs: string[]): Promise<Record<string, JobNotesSummary>> {
  const ids = Array.from(new Set(jobIDs.filter(Boolean)));
  if (ids.length === 0) return {};

  const jobs = await prisma.job.findMany({
    where: { id: { in: ids } },
    select: { id: true, name: true },
  });
  const trainingFolder = await getTrainingFolder();

  const entries = await Promise.all(
    jobs.map(async job => {
      const notesPath = path.join(trainingFolder, job.name, 'notes.md');
      let content = '';
      try {
        content = await readTextHead(notesPath, SUMMARY_READ_BYTES);
      } catch {
        // no notes file for this job yet
      }

      const summary: JobNotesSummary = {
        summary: getNotesSummary(content),
        excerpt: getNotesExcerpt(content),
        hasNotes: content.trim().length > 0,
      };
      return [job.id, summary] as const;
    }),
  );

  return Object.fromEntries(entries);
}
