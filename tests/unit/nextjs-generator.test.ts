import os from 'node:os';
import path from 'node:path';
import prettier from 'prettier';
import { beforeEach, describe, expect, it } from 'vitest';
import type {
  GenerationRequest,
  PartialProjectConfig,
  ProjectConfig,
} from '../../src/config/schema.js';
import { parseProjectConfig } from '../../src/config/schema.js';
import { nextjsGenerator } from '../../src/generator/frameworks/nextjs/index.js';
import { generateProject, type GenerationResult } from '../../src/generator/pipeline.js';
import { clearGenerators, registerGenerator } from '../../src/generator/registry.js';
import { MemoryLogger } from '../../src/util/logger.js';

const GOLDEN: ProjectConfig = parseProjectConfig({
  projectName: 'web-client',
  framework: 'nextjs',
  projectType: 'web',
  architecture: 'modular',
  database: 'none',
  orm: 'none',
  authentication: 'jwt',
  repositoryPattern: false,
  testing: 'vitest',
  docker: true,
  aiDocumentation: true,
  packageManager: 'npm',
});

async function render(overrides: PartialProjectConfig = {}): Promise<GenerationResult> {
  const config = parseProjectConfig({ ...GOLDEN, ...overrides });
  const request: GenerationRequest = {
    config,
    targetDir: path.join(os.tmpdir(), 'scafolder-render-nextjs', config.projectName),
    install: false,
    git: false,
    dryRun: true,
    force: false,
  };
  return generateProject(request, { logger: new MemoryLogger() });
}

beforeEach(() => {
  clearGenerators();
  registerGenerator(nextjsGenerator);
});

describe('nextjs generator — golden path', () => {
  it('renders the expected project shape', async () => {
    const { writtenFiles } = await render();

    for (const expected of [
      'src/app/layout.tsx',
      'src/app/page.tsx',
      'src/app/globals.css',
      'src/lib/env.ts',
      'src/lib/api/api-error.ts',
      'src/lib/api/server-api.ts',
      'src/lib/api/route-helpers.ts',
      'src/lib/auth/session.ts',
      'src/lib/auth/auth-api.ts',
      'src/lib/auth/schemas.ts',
      'src/app/api/auth/login/route.ts',
      'src/app/api/auth/register/route.ts',
      'src/app/api/auth/refresh/route.ts',
      'src/app/api/auth/logout/route.ts',
      'src/app/(auth)/login/page.tsx',
      'src/app/(auth)/register/page.tsx',
      'src/app/(app)/dashboard/page.tsx',
      'src/components/ui/button.tsx',
      'src/components/ui/text-field.tsx',
      'src/components/ui/password-field.tsx',
      'src/components/ui/modal.tsx',
      'src/components/ui/toast.tsx',
      'src/components/states/error-state.tsx',
      'src/middleware.ts',
      'next.config.ts',
      'vitest.config.mts',
      'Dockerfile',
      '.env.example',
      'ARCHITECTURE.md',
    ]) {
      expect(writtenFiles, expected).toContain(expected);
    }
  });

  it("produces Prettier-clean TypeScript, matching the project's own config", async () => {
    const { renderedFiles } = await render();
    const options = {
      singleQuote: true,
      trailingComma: 'all' as const,
      printWidth: 100,
    };

    const unformatted: string[] = [];
    for (const [file, content] of renderedFiles) {
      if (!/\.(ts|tsx|mts)$/.test(file)) continue;
      if (!(await prettier.check(content, { ...options, filepath: file }))) unformatted.push(file);
    }

    expect(unformatted).toEqual([]);
  });

  it('listens on a different port from the API it talks to', async () => {
    const { renderedFiles } = await render();
    const manifest = JSON.parse(renderedFiles.get('package.json') ?? '{}') as {
      scripts?: Record<string, string>;
    };

    expect(manifest.scripts?.['dev']).toContain('--port 3001');
    expect(renderedFiles.get('.env.example')).toContain('API_URL=http://localhost:3000');
  });

  it('does not overwrite the AGENTS.md block Next.js manages', async () => {
    // create-next-app writes AGENTS.md and re-adds its block on every dev run;
    // a dry run has no such file, so ours is written whole. The merge itself is
    // covered in the pipeline tests.
    const { renderedFiles } = await render();
    expect(renderedFiles.get('AGENTS.md')).toContain('Operational rules for coding agents');
  });
});

describe('nextjs generator — security defaults', () => {
  it('keeps tokens out of the browser', async () => {
    const { renderedFiles } = await render();
    const session = renderedFiles.get('src/lib/auth/session.ts') ?? '';

    expect(session).toContain("import 'server-only'");
    expect(session).toContain('httpOnly: true');
    expect(session).toContain("sameSite: 'lax' as const");

    // No client component may import the session module.
    for (const [file, content] of renderedFiles) {
      if (!file.endsWith('.tsx')) continue;
      if (!content.includes("'use client'")) continue;
      expect(content, `${file} is a client component`).not.toContain('lib/auth/session');
    }
  });

  it('never exposes configuration to the browser bundle', async () => {
    const { renderedFiles } = await render();

    for (const [file, content] of renderedFiles) {
      if (!file.startsWith('src/')) continue;
      // Comments may name the prefix to explain why it is avoided; what matters
      // is that no variable is actually declared or read with it.
      const code = content
        .split('\n')
        .filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line))
        .join('\n');

      expect(code, file).not.toMatch(/NEXT_PUBLIC_[A-Z0-9_]+/);
    }
  });

  it('marks server-only modules as such', async () => {
    const { renderedFiles } = await render();
    for (const file of [
      'src/lib/env.ts',
      'src/lib/api/server-api.ts',
      'src/lib/auth/auth-api.ts',
    ]) {
      expect(renderedFiles.get(file), file).toContain("import 'server-only'");
    }
  });

  it('runs the container as a non-root user', async () => {
    const { renderedFiles } = await render();
    expect(renderedFiles.get('Dockerfile')).toContain('USER node');
  });
});

describe('nextjs generator — configuration drives the output', () => {
  it('omits auth entirely when it is off', async () => {
    const { writtenFiles, renderedFiles } = await render({ authentication: 'none' });

    expect(writtenFiles.filter((f) => f.includes('/auth/'))).toEqual([]);
    expect(writtenFiles).not.toContain('src/middleware.ts');
    expect(renderedFiles.get('src/app/layout.tsx')).not.toContain('ToastProvider');
    expect(renderedFiles.get('.env.example')).not.toContain('SESSION_COOKIE_NAME');
  });

  it('omits specs and the Vitest config when there is no test runner', async () => {
    const { writtenFiles } = await render({ testing: 'none' });
    expect(writtenFiles.filter((f) => f.includes('.spec.'))).toEqual([]);
    expect(writtenFiles).not.toContain('vitest.config.mts');
  });

  it('drops standalone output when Docker is not requested', async () => {
    const { writtenFiles, renderedFiles } = await render({ docker: false });

    expect(writtenFiles).not.toContain('Dockerfile');
    expect(renderedFiles.get('next.config.ts')).not.toContain("output: 'standalone'");
  });
});
