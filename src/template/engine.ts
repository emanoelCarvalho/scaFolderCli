import fs from 'node:fs/promises';
import path from 'node:path';
import { Eta } from 'eta';
import { ScafolderError } from '../util/errors.js';
import { listFiles, pathExists } from '../fs/files.js';
import type { ProjectFiles } from '../fs/project-files.js';
import { TEMPLATES_ROOT, isRenderable, outputPathFor } from './paths.js';

/**
 * `autoEscape` is off because we emit source code, not HTML. `<% %>` was chosen
 * over `{{ }}` since it cannot collide with JS, JSON, YAML or Svelte syntax.
 */
const eta = new Eta({
  views: TEMPLATES_ROOT,
  autoEscape: false,
  autoTrim: false,
  useWith: false,
  cache: false,
});

/**
 * Any plain object exposed to templates as `it`. Kept as `object` rather than
 * `Record<string, unknown>` so interfaces (which lack an implicit index
 * signature) can be passed directly.
 */
export type TemplateScope = object;

export function renderTemplateString(source: string, data: TemplateScope, origin: string): string {
  try {
    return eta.renderString(source, data);
  } catch (error) {
    throw new ScafolderError('INTERNAL', `Failed to render template "${origin}".`, {
      cause: error,
    });
  }
}

/**
 * A named directory under `templates/`. Layers are applied in order and later
 * layers overwrite earlier ones, which is what lets one `base` layer be shared
 * by every framework instead of duplicating whole trees per combination.
 */
export interface Layer {
  /** Path relative to `templates/`, e.g. `frameworks/nestjs/auth`. */
  dir: string;
  /** Skipped when false. Lets generators express layers declaratively. */
  when?: boolean;
  /** Prefix prepended to every output path, e.g. `src/modules`. */
  outputPrefix?: string;
}

export interface ApplyLayersOptions {
  /** Overridden for tests; defaults to the packaged templates directory. */
  templatesRoot?: string;
}

/**
 * Renders every enabled layer into the buffered file set.
 *
 * Missing layer directories are an error rather than a silent skip: a typo in a
 * layer name must not quietly produce an incomplete project.
 */
export async function applyLayers(
  files: ProjectFiles,
  layers: readonly Layer[],
  data: TemplateScope,
  options: ApplyLayersOptions = {},
): Promise<void> {
  const root = options.templatesRoot ?? TEMPLATES_ROOT;

  for (const layer of layers) {
    if (layer.when === false) continue;

    const layerDir = path.resolve(root, layer.dir);
    if (!(await pathExists(layerDir))) {
      throw new ScafolderError('TEMPLATE_NOT_FOUND', `Template layer "${layer.dir}" not found.`, {
        hint: `Expected directory: ${layerDir}`,
      });
    }

    for (const relativePath of await listFiles(layerDir)) {
      const source = await fs.readFile(path.join(layerDir, relativePath), 'utf8');
      const content = isRenderable(relativePath)
        ? renderTemplateString(source, data, `${layer.dir}/${relativePath}`)
        : source;

      const output = outputPathFor(relativePath);
      files.write(layer.outputPrefix ? `${layer.outputPrefix}/${output}` : output, content);
    }
  }
}
