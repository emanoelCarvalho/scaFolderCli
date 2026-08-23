import { z } from 'zod';
import { ScafolderError } from '../util/errors.js';
import { checkProjectName } from '../util/project-name.js';

export const FRAMEWORKS = ['nestjs', 'express', 'nextjs', 'svelte'] as const;
export const PROJECT_TYPES = ['api', 'web'] as const;
export const ARCHITECTURES = ['modular', 'layered', 'clean'] as const;
export const DATABASES = ['postgresql', 'mysql', 'mongodb', 'sqlite', 'none'] as const;
export const ORMS = ['prisma', 'sequelize', 'typeorm', 'mongoose', 'none'] as const;
export const AUTHENTICATIONS = ['jwt', 'none'] as const;
export const TEST_RUNNERS = ['vitest', 'jest', 'none'] as const;
export const PACKAGE_MANAGERS = ['npm', 'pnpm', 'yarn'] as const;

export type Framework = (typeof FRAMEWORKS)[number];
export type ProjectType = (typeof PROJECT_TYPES)[number];
export type Architecture = (typeof ARCHITECTURES)[number];
export type Database = (typeof DATABASES)[number];
export type Orm = (typeof ORMS)[number];
export type Authentication = (typeof AUTHENTICATIONS)[number];
export type TestRunner = (typeof TEST_RUNNERS)[number];
export type PackageManager = (typeof PACKAGE_MANAGERS)[number];

export const projectConfigSchema = z.object({
  /** npm package name of the generated project. May be scoped. */
  projectName: z.string().superRefine((value, ctx) => {
    const check = checkProjectName(value);
    if (!check.valid) {
      ctx.addIssue({ code: 'custom', message: check.reason ?? 'Invalid project name.' });
    }
  }),
  framework: z.enum(FRAMEWORKS),
  projectType: z.enum(PROJECT_TYPES),
  architecture: z.enum(ARCHITECTURES),
  database: z.enum(DATABASES),
  orm: z.enum(ORMS),
  authentication: z.enum(AUTHENTICATIONS),
  /** Isolates domain code from the ORM behind an interface. */
  repositoryPattern: z.boolean(),
  testing: z.enum(TEST_RUNNERS),
  docker: z.boolean(),
  /** Emits ARCHITECTURE.md, CONVENTIONS.md and AGENTS.md derived from this config. */
  aiDocumentation: z.boolean(),
  packageManager: z.enum(PACKAGE_MANAGERS),
});

/**
 * Describes what the generated project *is*. Everything here is serializable so
 * that presets and `--config` files are plain data.
 */
export type ProjectConfig = z.infer<typeof projectConfigSchema>;

/** A preset or CLI flag set: any subset of a project's identity. */
export type PartialProjectConfig = Partial<ProjectConfig>;

/**
 * Describes how a single generation *run* behaves. Deliberately separate from
 * ProjectConfig: these values are never persisted into a preset.
 */
export interface GenerationRequest {
  config: ProjectConfig;
  /** Absolute path. Created if missing. */
  targetDir: string;
  install: boolean;
  git: boolean;
  /** Plan the run and report it without touching the filesystem. */
  dryRun: boolean;
  /** Allow writing into a non-empty directory. */
  force: boolean;
}

/**
 * Validates shape only. Cross-field compatibility lives in the capability
 * matrix so that rules stay data, not schema refinements.
 */
export function parseProjectConfig(input: unknown): ProjectConfig {
  const result = projectConfigSchema.safeParse(input);
  if (result.success) return result.data;

  const details = result.error.issues
    .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
    .join('\n');
  throw new ScafolderError('INVALID_CONFIG', `Invalid project configuration:\n${details}`, {
    hint: 'Run `scafoldercli create` without flags to build a valid configuration interactively.',
  });
}
