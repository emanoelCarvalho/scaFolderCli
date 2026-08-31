import { randomBytes } from 'node:crypto';
import type { ProjectFiles } from '../fs/project-files.js';

/**
 * Matches a placeholder secret in `.env.example`, e.g.
 * `JWT_ACCESS_SECRET=replace-me-with-...`.
 */
const PLACEHOLDER_SECRET = /^([A-Z0-9_]*(?:SECRET|KEY|TOKEN))=replace-me\S*$/gm;

/**
 * Writes a local `.env` derived from `.env.example`, replacing every
 * placeholder secret with a freshly generated random value.
 *
 * Copying the example verbatim would be worse than doing nothing: the project
 * would start with a secret that is identical in every generated project and
 * published in this repository. Generating one means the project runs
 * immediately and has never had a known key.
 *
 * `.env` is gitignored by the base layer, and `.env.example` keeps its
 * placeholders so the committed file still documents what is required.
 */
export function writeLocalEnvFile(files: ProjectFiles, example: string, target = '.env'): void {
  files.write(
    target,
    example.replace(PLACEHOLDER_SECRET, (_match, name: string) => `${name}=${generateSecret()}`),
  );
}

/** 48 bytes of entropy, comfortably above the 32-character minimum enforced. */
function generateSecret(): string {
  return randomBytes(48).toString('base64url');
}
