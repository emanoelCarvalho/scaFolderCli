import path from 'node:path';

/**
 * Templates ship as plain files at the package root (see `files` in
 * package.json) rather than inside `dist`, so no build step has to copy them.
 * Both `src/template/` and `dist/template/` sit one level below the root, which
 * makes this resolution identical during development and after publishing.
 */
export const TEMPLATES_ROOT = path.resolve(import.meta.dirname, '../../templates');

/**
 * Maps a template file name to its output name.
 *
 * - `.eta` suffix marks a file to render, and is stripped.
 * - A leading `_` on any segment becomes `.`, because npm strips real dotfiles
 *   such as `.gitignore` from published packages.
 */
export function outputPathFor(templateRelativePath: string): string {
  const withoutEta = templateRelativePath.endsWith('.eta')
    ? templateRelativePath.slice(0, -'.eta'.length)
    : templateRelativePath;

  return withoutEta
    .split('/')
    .map((segment) => (segment.startsWith('_') ? `.${segment.slice(1)}` : segment))
    .join('/');
}

export function isRenderable(templateRelativePath: string): boolean {
  return templateRelativePath.endsWith('.eta');
}
