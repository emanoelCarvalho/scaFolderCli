import path from 'node:path';
import { ScafolderError } from './errors.js';

const MAX_LENGTH = 214;
const UNSCOPED = /^[a-z0-9][a-z0-9._-]*$/;
const SCOPED = /^@[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._-]*$/;

/** npm forbids these outright. */
const RESERVED_NPM = new Set(['node_modules', 'favicon.ico']);

/**
 * Windows refuses to create directories with these names regardless of
 * extension. Rejecting them everywhere keeps generated projects portable.
 */
const RESERVED_WINDOWS = new Set([
  'con',
  'prn',
  'aux',
  'nul',
  ...Array.from({ length: 9 }, (_, i) => `com${i + 1}`),
  ...Array.from({ length: 9 }, (_, i) => `lpt${i + 1}`),
]);

export interface ProjectNameCheck {
  valid: boolean;
  /** Present when `valid` is false. */
  reason?: string;
}

/**
 * Validates a name that must work as BOTH an npm package name and a directory
 * name on macOS, Linux and Windows.
 */
export function checkProjectName(name: string): ProjectNameCheck {
  if (name.length === 0) return { valid: false, reason: 'Project name cannot be empty.' };
  if (name.trim() !== name)
    return { valid: false, reason: 'Project name cannot start or end with whitespace.' };
  if (name.length > MAX_LENGTH)
    return { valid: false, reason: `Project name cannot exceed ${MAX_LENGTH} characters.` };
  if (name !== name.toLowerCase())
    return { valid: false, reason: 'Project name must be lowercase.' };
  if (name.startsWith('.') || name.startsWith('_'))
    return { valid: false, reason: 'Project name cannot start with "." or "_".' };

  const scoped = name.startsWith('@');
  if (scoped ? !SCOPED.test(name) : !UNSCOPED.test(name)) {
    return {
      valid: false,
      reason: 'Project name may only contain lowercase letters, digits, ".", "-" and "_".',
    };
  }

  const directory = directoryNameFor(name);
  if (RESERVED_NPM.has(directory)) {
    return { valid: false, reason: `"${directory}" is a reserved npm name.` };
  }
  if (RESERVED_WINDOWS.has(directory.split('.')[0] ?? directory)) {
    return { valid: false, reason: `"${directory}" is a reserved device name on Windows.` };
  }

  return { valid: true };
}

export function assertProjectName(name: string): void {
  const result = checkProjectName(name);
  if (!result.valid) {
    throw new ScafolderError('INVALID_PROJECT_NAME', result.reason ?? 'Invalid project name.', {
      hint: 'Use a lowercase npm-compatible name, for example "my-api".',
    });
  }
}

/** `@acme/billing-api` -> `billing-api`; unscoped names pass through. */
export function directoryNameFor(projectName: string): string {
  if (!projectName.startsWith('@')) return projectName;
  const segment = projectName.split('/')[1];
  return segment ?? projectName.slice(1);
}

/**
 * Resolves where a project will be written. `.` means "the current directory",
 * which is how users scaffold into an already-created folder.
 */
export function resolveTargetDir(projectName: string, cwd: string, explicitDir?: string): string {
  if (explicitDir) return path.resolve(cwd, explicitDir);
  return path.resolve(cwd, directoryNameFor(projectName));
}

/**
 * Derives a suggested project name from a directory path, for when the user
 * scaffolds in place. Falls back to `app` when nothing usable remains.
 */
export function suggestProjectName(dir: string): string {
  const base = path
    .basename(path.resolve(dir))
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^[._-]+/, '')
    .replace(/-+$/, '');
  return checkProjectName(base).valid ? base : 'app';
}
