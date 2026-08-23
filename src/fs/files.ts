import fs from 'node:fs/promises';
import path from 'node:path';
import { ScafolderError } from '../util/errors.js';

export async function pathExists(target: string): Promise<boolean> {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

export async function ensureDir(target: string): Promise<void> {
  await fs.mkdir(target, { recursive: true });
}

/** Treats a missing directory as empty. Ignores `.git` and macOS `.DS_Store`. */
export async function isDirectoryEmpty(target: string): Promise<boolean> {
  try {
    const entries = await fs.readdir(target);
    return entries.filter((e) => e !== '.git' && e !== '.DS_Store').length === 0;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return true;
    throw error;
  }
}

/** Recursively lists files relative to `root`, using POSIX separators. */
export async function listFiles(root: string): Promise<string[]> {
  const out: string[] = [];
  async function walk(dir: string, prefix: string): Promise<void> {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) await walk(path.join(dir, entry.name), rel);
      else out.push(rel);
    }
  }
  await walk(root, '');
  return out.sort();
}

/**
 * Rejects paths that would escape the project root. Every write funnels through
 * here so a malformed template can never touch the user's wider filesystem.
 */
export function resolveInside(root: string, relativePath: string): string {
  if (path.isAbsolute(relativePath)) {
    throw new ScafolderError('INTERNAL', `Expected a relative path, received "${relativePath}".`);
  }
  const resolved = path.resolve(root, relativePath);
  const rootWithSep = root.endsWith(path.sep) ? root : root + path.sep;
  if (resolved !== root && !resolved.startsWith(rootWithSep)) {
    throw new ScafolderError('INTERNAL', `Path "${relativePath}" escapes the project directory.`);
  }
  return resolved;
}

export async function writeFileEnsured(target: string, content: string): Promise<void> {
  await ensureDir(path.dirname(target));
  await fs.writeFile(target, content, 'utf8');
}

export async function readTextFile(target: string): Promise<string> {
  return fs.readFile(target, 'utf8');
}

export async function removeDir(target: string): Promise<void> {
  await fs.rm(target, { recursive: true, force: true });
}
