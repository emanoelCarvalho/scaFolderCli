import type { GenerationContext } from '../generator/context.js';
import { applyLayers } from '../template/engine.js';
import type { DocumentationFacts } from './facts.js';

/**
 * Renders ARCHITECTURE.md, CONVENTIONS.md and AGENTS.md from the generator's
 * declared facts. One shared layer serves every framework: the difference lives
 * in the facts, not in duplicated markdown.
 */
export async function writeAiDocumentation(
  context: GenerationContext,
  facts: DocumentationFacts,
): Promise<void> {
  await applyLayers(context.files, [{ dir: 'ai' }], { ...context.data, facts });
}
