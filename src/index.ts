export { generateProject, type GenerationResult } from './generator/pipeline.js';
export { registerGenerator, getGenerator, implementedFrameworks } from './generator/registry.js';
export type { FrameworkGenerator } from './generator/contract.js';
export type { GenerationContext } from './generator/context.js';
export type { DocumentationFacts, LayerFact, CommandFact } from './docs/facts.js';
export {
  parseProjectConfig,
  projectConfigSchema,
  type ProjectConfig,
  type PartialProjectConfig,
  type GenerationRequest,
  type Framework,
} from './config/schema.js';
export {
  FRAMEWORK_CAPABILITIES,
  DATABASE_ORMS,
  findIncompatibilities,
  assertCompatible,
  applyFrameworkDefaults,
} from './config/capabilities.js';
export { PRESETS, findPreset, presetNames, type Preset } from './config/presets.js';
export { ScafolderError, isScafolderError, type ScafolderErrorCode } from './util/errors.js';
export { registerBuiltInGenerators } from './generator/builtins.js';
