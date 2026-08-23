import { spawn } from 'node:child_process';
import { ScafolderError } from '../util/errors.js';

/**
 * Windows refuses to spawn `.cmd`/`.bat` shims (npm, npx, pnpm, yarn) without a
 * shell, so we opt into one there. Every argument we pass originates from our
 * own validated configuration, never from raw user input.
 */
const IS_WINDOWS = process.platform === 'win32';

export interface RunCommandOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  /** Milliseconds before the child is killed. Defaults to 10 minutes. */
  timeout?: number;
  /** Receives stdout/stderr chunks as they arrive. */
  onOutput?: (chunk: string) => void;
}

export interface CommandResult {
  stdout: string;
  stderr: string;
}

export async function runCommand(
  command: string,
  args: readonly string[],
  options: RunCommandOptions = {},
): Promise<CommandResult> {
  const { cwd, env, timeout = 10 * 60_000, onOutput } = options;

  return new Promise<CommandResult>((resolve, reject) => {
    const child = spawn(command, [...args], {
      cwd,
      env: { ...process.env, ...env },
      shell: IS_WINDOWS,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
    }, timeout);

    child.stdout?.on('data', (chunk: Buffer) => {
      const text = chunk.toString();
      stdout += text;
      onOutput?.(text);
    });
    child.stderr?.on('data', (chunk: Buffer) => {
      const text = chunk.toString();
      stderr += text;
      onOutput?.(text);
    });

    child.on('error', (error) => {
      clearTimeout(timer);
      reject(
        new ScafolderError('COMMAND_FAILED', `Failed to run \`${describe(command, args)}\`.`, {
          hint: `Make sure "${command}" is installed and available on your PATH.`,
          cause: error,
        }),
      );
    });

    child.on('close', (code) => {
      clearTimeout(timer);
      if (timedOut) {
        reject(
          new ScafolderError(
            'COMMAND_FAILED',
            `\`${describe(command, args)}\` timed out after ${timeout}ms.`,
          ),
        );
        return;
      }
      if (code !== 0) {
        reject(
          new ScafolderError(
            'COMMAND_FAILED',
            `\`${describe(command, args)}\` exited with code ${code}.\n${tail(stderr || stdout)}`,
          ),
        );
        return;
      }
      resolve({ stdout, stderr });
    });
  });
}

/** Probes for an executable without failing the run when it is absent. */
export async function commandExists(command: string): Promise<boolean> {
  try {
    await runCommand(command, ['--version'], { timeout: 20_000 });
    return true;
  } catch {
    return false;
  }
}

function describe(command: string, args: readonly string[]): string {
  return [command, ...args].join(' ');
}

function tail(output: string, lines = 20): string {
  return output.trimEnd().split('\n').slice(-lines).join('\n');
}
