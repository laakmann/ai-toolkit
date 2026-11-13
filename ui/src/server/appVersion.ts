import fs from 'fs';
import path from 'path';

/**
 * Read the toolkit version from the running checkout. This intentionally
 * happens at request time rather than build time so a dev server or an old
 * `.next` bundle cannot keep displaying a stale version.
 */
export function getAppVersion(): string {
  // The Next server normally runs with ui/ as its cwd; version.py sits one
  // level up. Fall back to cwd for unusual launch layouts.
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
