import fs from 'fs';
import path from 'path';
import { getDatasetsRoot, getModelsPath, getTrainingFolder } from '@/server/settings';

export class FileAccessError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = 'FileAccessError';
    this.status = status;
  }
}

export interface AllowedFile {
  resolvedFilePath: string;
  stat: fs.Stats;
}

/** Folders the file-preview endpoints are allowed to read from. */
export async function getAllowedRoots(): Promise<string[]> {
  const [datasetsRoot, trainingRoot, modelsRoot] = await Promise.all([
    getDatasetsRoot(),
    getTrainingFolder(),
    getModelsPath(),
  ]);

  return Array.from(new Set([datasetsRoot, trainingRoot, modelsRoot].map(root => path.resolve(root))));
}

function comparablePath(filePath: string): string {
  return process.platform === 'win32' ? filePath.toLowerCase() : filePath;
}

export function isPathAllowed(resolvedFilePath: string, allowedDirs: string[]): boolean {
  const candidate = comparablePath(resolvedFilePath);
  return allowedDirs.some(allowedDir => {
    const root = comparablePath(allowedDir);
    return candidate === root || candidate.startsWith(root + path.sep);
  });
}

/**
 * Decode, normalise and authorise a file path from a request body. Throws a
 * FileAccessError with a status code suitable for the route response.
 */
export async function resolveAllowedFile(filePath: unknown): Promise<AllowedFile> {
  if (!filePath || typeof filePath !== 'string') {
    throw new FileAccessError('filePath is required', 400);
  }

  let decodedFilePath: string;
  try {
    decodedFilePath = decodeURIComponent(filePath);
  } catch {
    // A literal '%' in a path is valid on disk; treat it as already decoded.
    decodedFilePath = filePath;
  }

  const resolvedFilePath = path.resolve(decodedFilePath);
  const allowedDirs = await getAllowedRoots();
  if (!isPathAllowed(resolvedFilePath, allowedDirs)) {
    console.warn(`Access denied: ${resolvedFilePath} not in ${allowedDirs.join(', ')}`);
    throw new FileAccessError('Access denied', 403);
  }

  let stat: fs.Stats;
  try {
    stat = await fs.promises.stat(resolvedFilePath);
  } catch {
    throw new FileAccessError('File not found', 404);
  }

  if (!stat.isFile()) {
    throw new FileAccessError('Not a file', 400);
  }

  return { resolvedFilePath, stat };
}
