import type { ProjectFiles } from '../fs/project-files.js';

/**
 * Files a framework CLI writes that our layers must extend rather than replace.
 *
 * Both are append-safe by nature: a `.gitignore` is the union of its lines, and
 * `AGENTS.md` is prose. Overwriting either loses real content — Next.js ignores
 * `.next/` and `.vercel`, and maintains a managed block in `AGENTS.md` that it
 * re-inserts on every `next dev`.
 */
const APPEND_TO_FRAMEWORK_FILES = ['.gitignore', 'AGENTS.md'] as const;

export type FrameworkFileSnapshot = ReadonlyMap<string, string>;

/**
 * Records what the framework CLI wrote, before our layers are applied.
 * Call before `generate()`.
 */
export async function snapshotFrameworkFiles(files: ProjectFiles): Promise<FrameworkFileSnapshot> {
  const snapshot = new Map<string, string>();
  for (const file of APPEND_TO_FRAMEWORK_FILES) {
    const content = await files.read(file);
    if (content !== null) snapshot.set(file, content);
  }
  return snapshot;
}

/**
 * Puts the framework's content back, with ours appended. Call after every layer
 * and every documentation step has run.
 *
 * Ours goes last on purpose: in a `.gitignore`, a later negation such as
 * `!.env.example` overrides an earlier `.env*`.
 */
export async function restoreFrameworkFiles(
  files: ProjectFiles,
  snapshot: FrameworkFileSnapshot,
): Promise<void> {
  for (const [file, previous] of snapshot) {
    const ours = await files.read(file);
    // Nothing of ours to merge: the framework's file already stands.
    if (ours === null || ours.trim() === previous.trim()) continue;
    files.write(file, `${previous.trimEnd()}\n\n${ours.trimStart()}`);
  }
}
