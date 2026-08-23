/**
 * Structured, framework-supplied truths about a generated project. AI and human
 * documentation is rendered from these facts, which is what guarantees the docs
 * describe the code that was actually written instead of a generic template.
 */
export interface DocumentationFacts {
  /** One sentence: what this project is. */
  summary: string;
  /** Rendered directory tree, without a fence. */
  directoryLayout: string;
  /** Architectural layers or module groups, in dependency order. */
  layers: readonly LayerFact[];
  /** Hard rules an agent must not break, e.g. "domain imports nothing". */
  dependencyRules: readonly string[];
  /** Conventions specific to this stack, beyond the shared baseline. */
  conventions: readonly string[];
  /** Everyday commands, already using the chosen package manager. */
  commands: readonly CommandFact[];
  /** Extra operational instructions for coding agents. */
  agentRules: readonly string[];
  /** How to add a typical feature to this project, step by step. */
  addFeatureSteps: readonly string[];
}

export interface LayerFact {
  name: string;
  path: string;
  responsibility: string;
  /** Layers this one is allowed to depend on. */
  mayDependOn: readonly string[];
}

export interface CommandFact {
  label: string;
  command: string;
}
