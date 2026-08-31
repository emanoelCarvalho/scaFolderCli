import fs from 'node:fs/promises';
import path from 'node:path';
import { ensureDir, pathExists, readTextFile, resolveInside, writeFileEnsured } from './files.js';

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };
export type JsonObject = { [key: string]: JsonValue };

type Operation = { kind: 'write'; content: string } | { kind: 'delete' };

export interface ProjectFilesOptions {
  /** Buffer everything and never touch the filesystem. */
  dryRun?: boolean;
}

/**
 * Buffers all writes and applies them in one pass. Two reasons:
 *
 * 1. A failure half-way through generation leaves no partially written files.
 * 2. `--dry-run` and unit tests can inspect the exact output without disk I/O.
 *
 * Reads fall through to disk, so buffered edits compose with files produced by
 * an official framework CLI that already ran.
 */
export class ProjectFiles {
  private readonly operations = new Map<string, Operation>();

  constructor(
    readonly root: string,
    private readonly options: ProjectFilesOptions = {},
  ) {}

  private normalize(relativePath: string): string {
    resolveInside(this.root, relativePath);
    return relativePath.split(path.sep).join('/');
  }

  write(relativePath: string, content: string): void {
    const key = this.normalize(relativePath);
    this.operations.set(key, { kind: 'write', content: ensureTrailingNewline(content) });
  }

  writeJson(relativePath: string, value: JsonObject): void {
    this.write(relativePath, `${formatJson(value)}\n`);
  }

  delete(relativePath: string): void {
    this.operations.set(this.normalize(relativePath), { kind: 'delete' });
  }

  async read(relativePath: string): Promise<string | null> {
    const key = this.normalize(relativePath);
    const pending = this.operations.get(key);
    if (pending) return pending.kind === 'write' ? pending.content : null;

    const absolute = resolveInside(this.root, relativePath);
    if (!(await pathExists(absolute))) return null;
    return readTextFile(absolute);
  }

  async readJson<T extends JsonObject>(relativePath: string): Promise<T | null> {
    const raw = await this.read(relativePath);
    return raw === null ? null : (JSON.parse(raw) as T);
  }

  async exists(relativePath: string): Promise<boolean> {
    const key = this.normalize(relativePath);
    const pending = this.operations.get(key);
    if (pending) return pending.kind === 'write';
    return pathExists(resolveInside(this.root, relativePath));
  }

  /**
   * Deep-merges `patch` into an existing JSON file (or creates it). Objects are
   * merged key by key; every other value, arrays included, is replaced. That
   * rule is deliberately boring so template authors can predict the result.
   */
  async mergeJson(relativePath: string, patch: JsonObject): Promise<void> {
    const current = (await this.readJson(relativePath)) ?? {};
    this.writeJson(relativePath, deepMerge(current, patch));
  }

  /** Relative paths this run will create or overwrite, sorted. */
  plannedWrites(): string[] {
    return [...this.operations.entries()]
      .filter(([, op]) => op.kind === 'write')
      .map(([key]) => key)
      .sort();
  }

  /** Relative path -> content for every buffered write, for tests and dry runs. */
  plannedContents(): Map<string, string> {
    const contents = new Map<string, string>();
    for (const [key, operation] of this.operations) {
      if (operation.kind === 'write') contents.set(key, operation.content);
    }
    return contents;
  }

  plannedDeletions(): string[] {
    return [...this.operations.entries()]
      .filter(([, op]) => op.kind === 'delete')
      .map(([key]) => key)
      .sort();
  }

  /** Applies every buffered operation. A no-op in dry-run mode. */
  async flush(): Promise<void> {
    if (this.options.dryRun) return;
    await ensureDir(this.root);
    for (const [relativePath, operation] of this.operations) {
      const absolute = resolveInside(this.root, relativePath);
      if (operation.kind === 'delete') {
        await fs.rm(absolute, { force: true, recursive: true });
      } else {
        await writeFileEnsured(absolute, operation.content);
      }
    }
    this.operations.clear();
  }
}

/** Longest line `formatJson` will produce before leaving an array expanded. */
const JSON_PRINT_WIDTH = 100;

/**
 * `JSON.stringify` always puts each array element on its own line; Prettier
 * keeps short arrays inline. Generated manifests are checked by the project's
 * own `format:check`, so the two have to agree — a freshly generated project
 * failing its own formatter is a defect.
 *
 * Only arrays of primitives are collapsed, and only when the result fits.
 */
export function formatJson(value: JsonObject): string {
  const expanded = JSON.stringify(value, null, 2);

  return expanded
    .split('\n')
    .reduce<{ lines: string[]; buffer: string[] | null }>(
      (state, line) => {
        if (state.buffer) {
          state.buffer.push(line);
          if (!line.trimEnd().endsWith(']') && !line.trimEnd().endsWith('],')) return state;

          // The buffered lines are kept verbatim, so an array that stays
          // expanded keeps the indentation JSON.stringify gave it.
          const collapsed = collapseArray(state.buffer);
          state.lines.push(...(collapsed !== null ? [collapsed] : state.buffer));
          state.buffer = null;
          return state;
        }

        // An array opens when the line ends with `[` and nothing follows.
        if (/\[$/.test(line.trimEnd())) {
          state.buffer = [line];
          return state;
        }

        state.lines.push(line);
        return state;
      },
      { lines: [], buffer: null },
    )
    .lines.join('\n');
}

/** Joins a buffered array onto one line, or returns null when it should stay expanded. */
function collapseArray(buffer: string[]): string | null {
  const opening = buffer[0] ?? '';
  const closing = (buffer.at(-1) ?? '').trim();
  const elements = buffer.slice(1, -1).map((line) => line.trim());

  // Nested structures keep their own layout; only flat arrays are collapsed.
  if (elements.some((element) => /[[{]/.test(element))) return null;

  const inline = `${opening}${elements.join(' ')}${closing}`;
  return inline.length <= JSON_PRINT_WIDTH ? inline : null;
}

function ensureTrailingNewline(content: string): string {
  return content.endsWith('\n') ? content : `${content}\n`;
}

function isPlainObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function deepMerge(base: JsonObject, patch: JsonObject): JsonObject {
  const result: JsonObject = { ...base };
  for (const [key, value] of Object.entries(patch)) {
    const existing = result[key];
    result[key] =
      isPlainObject(existing) && isPlainObject(value) ? deepMerge(existing, value) : value;
  }
  return result;
}

/** Keeps dependency maps alphabetical so generated files are reproducible. */
export function sortObjectKeys(value: JsonObject): JsonObject {
  return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)));
}
