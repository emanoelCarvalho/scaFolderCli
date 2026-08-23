import * as p from '@clack/prompts';
import pc from 'picocolors';
import {
  FRAMEWORK_CAPABILITIES,
  availableArchitectures,
  availableAuthentication,
  availableDatabases,
  availableOrms,
  availableProjectTypes,
  availableTestRunners,
  supportsRepositoryPattern,
  type Choice,
} from '../config/capabilities.js';
import {
  parseProjectConfig,
  type Framework,
  type PartialProjectConfig,
  type ProjectConfig,
} from '../config/schema.js';
import { implementedFrameworks } from '../generator/registry.js';
import { cancelled, ScafolderError } from '../util/errors.js';
import { checkProjectName } from '../util/project-name.js';

export interface PromptOptions {
  /** Answers already supplied by flags or a preset; never asked again. */
  initial: PartialProjectConfig;
  /** Suggested project name when the user did not pass one. */
  defaultProjectName?: string;
}

function unwrap<T>(value: T | symbol): T {
  if (p.isCancel(value)) throw cancelled();
  return value as T;
}

/**
 * Asks a question only when there is a real decision to make. A single valid
 * option is applied silently: the point of an opinionated scaffolder is a short
 * conversation, not an exhaustive form.
 */
async function pick<T>(
  message: string,
  choices: Choice<T>[],
  preselected: T | undefined,
  fallbackLabel: string,
): Promise<T> {
  if (preselected !== undefined) return preselected;
  if (choices.length === 0) {
    throw new ScafolderError('INVALID_COMBINATION', `No valid option available for ${message}.`, {
      hint: 'Revisit the earlier answers; this combination has no supported outcome.',
    });
  }
  const first = choices[0] as Choice<T>;
  if (choices.length === 1) {
    p.log.info(`${message} ${pc.dim('→')} ${first.label} ${pc.dim(`(${fallbackLabel})`)}`);
    return first.value;
  }
  // `Option<T>` is a conditional type that TypeScript cannot resolve while `T`
  // is still generic; every value we pass is a string literal union.
  const options = choices.map((c) => ({
    value: c.value,
    label: c.label,
    ...(c.hint ? { hint: c.hint } : {}),
  })) as unknown as Parameters<typeof p.select<T>>[0]['options'];

  return unwrap(await p.select<T>({ message, options, initialValue: first.value }));
}

async function confirmOption(
  message: string,
  preselected: boolean | undefined,
  initialValue: boolean,
): Promise<boolean> {
  if (preselected !== undefined) return preselected;
  return unwrap(await p.confirm({ message, initialValue }));
}

/** Walks the capability matrix, asking only what remains undecided. */
export async function promptForConfig(options: PromptOptions): Promise<ProjectConfig> {
  const { initial } = options;

  const projectName =
    initial.projectName ??
    unwrap(
      await p.text({
        message: 'Project name',
        placeholder: options.defaultProjectName ?? 'my-app',
        defaultValue: options.defaultProjectName ?? 'my-app',
        validate: (value) => {
          const typed = value ?? '';
          const candidate =
            typed.trim().length === 0 ? (options.defaultProjectName ?? 'my-app') : typed;
          const check = checkProjectName(candidate);
          return check.valid ? undefined : check.reason;
        },
      }),
    );

  const framework = await pick<Framework>(
    'Framework',
    frameworkChoices(),
    initial.framework,
    'only implemented framework',
  );

  const projectType = await pick(
    'Project type',
    availableProjectTypes(framework),
    initial.projectType,
    'only type supported by this framework',
  );

  const architecture = await pick(
    'Architecture',
    availableArchitectures(framework),
    initial.architecture,
    'only architecture supported',
  );

  const database = await pick(
    'Database',
    availableDatabases(framework),
    initial.database,
    'fixed by the framework',
  );

  const orm = await pick(
    'ORM',
    availableOrms(framework, database),
    initial.orm,
    'only ORM valid for this database',
  );

  const authentication = await pick(
    'Authentication',
    availableAuthentication(framework, projectType, database),
    initial.authentication,
    'requires a database',
  );

  const repositoryPattern = supportsRepositoryPattern(framework, database)
    ? await confirmOption(
        'Use the repository pattern? (isolates domain code from the ORM)',
        initial.repositoryPattern,
        true,
      )
    : false;

  const testing = await pick(
    'Test runner',
    availableTestRunners(framework),
    initial.testing,
    'only runner supported',
  );

  const docker = FRAMEWORK_CAPABILITIES[framework].docker
    ? await confirmOption('Generate Docker setup?', initial.docker, true)
    : false;

  const aiDocumentation = await confirmOption(
    'Generate AI documentation? (ARCHITECTURE.md, CONVENTIONS.md, AGENTS.md)',
    initial.aiDocumentation,
    true,
  );

  return parseProjectConfig({
    projectName,
    framework,
    projectType,
    architecture,
    database,
    orm,
    authentication,
    repositoryPattern,
    testing,
    docker,
    aiDocumentation,
    packageManager: initial.packageManager ?? 'npm',
  });
}

/** Only frameworks with a registered generator are offered. */
function frameworkChoices(): Choice<Framework>[] {
  const implemented = implementedFrameworks();
  if (implemented.length === 0) {
    throw new ScafolderError('GENERATOR_NOT_FOUND', 'No framework generators are registered.');
  }
  return implemented.map((framework) => ({
    value: framework,
    label: FRAMEWORK_CAPABILITIES[framework].label,
    hint: FRAMEWORK_CAPABILITIES[framework].hint,
  }));
}
