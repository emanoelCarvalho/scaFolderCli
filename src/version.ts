import { readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * Read from disk rather than imported, so the build works identically with and
 * without JSON import attributes across Node versions.
 */
export function readPackageVersion(): string {
  try {
    const manifest = path.resolve(import.meta.dirname, '../package.json');
    const parsed = JSON.parse(readFileSync(manifest, 'utf8')) as { version?: string };
    return parsed.version ?? '0.0.0';
  } catch {
    return '0.0.0';
  }
}
