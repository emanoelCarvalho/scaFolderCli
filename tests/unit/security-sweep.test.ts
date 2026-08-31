import os from 'node:os';
import path from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { FRAMEWORKS, parseProjectConfig, type Framework } from '../../src/config/schema.js';
import { PRESETS } from '../../src/config/presets.js';
import { generateProject } from '../../src/generator/pipeline.js';
import { clearGenerators } from '../../src/generator/registry.js';
import { registerBuiltInGenerators } from '../../src/generator/builtins.js';
import { MemoryLogger } from '../../src/util/logger.js';

/**
 * One sweep across every framework, checking the properties that must hold no
 * matter which one a user picks. Per-framework tests cover behaviour; this
 * covers the promises the README makes about all of them.
 */
const PRESET_FOR: Record<Framework, string> = {
  nestjs: 'nestjs-api',
  express: 'express-api',
  nextjs: 'nextjs-web',
  svelte: 'svelte-web',
};

async function renderAll(): Promise<Map<Framework, ReadonlyMap<string, string>>> {
  const results = new Map<Framework, ReadonlyMap<string, string>>();

  for (const framework of FRAMEWORKS) {
    const preset = PRESETS[PRESET_FOR[framework]];
    if (!preset) throw new Error(`No preset registered for ${framework}`);

    const config = parseProjectConfig({
      projectName: `${framework}-app`,
      packageManager: 'npm',
      ...preset.config,
    });

    const result = await generateProject(
      {
        config,
        targetDir: path.join(os.tmpdir(), 'scafolder-sweep', config.projectName),
        install: false,
        git: false,
        dryRun: true,
        force: false,
      },
      { logger: new MemoryLogger() },
    );
    results.set(framework, result.renderedFiles);
  }

  return results;
}

let rendered: Map<Framework, ReadonlyMap<string, string>>;

beforeEach(async () => {
  clearGenerators();
  registerBuiltInGenerators();
  rendered = await renderAll();
});

describe('security sweep across every framework', () => {
  it('generates all four frameworks', () => {
    expect([...rendered.keys()].sort()).toEqual([...FRAMEWORKS].sort());
  });

  it('never embeds a path from the machine that generated the project', () => {
    // Anchored on a delimiter and case-sensitive: an import of
    // `./modules/users/users.module` is not a home directory.
    const homePath = /(^|[\s'"(=])\/(Users|home)\/[a-z][\w.-]*\//;

    for (const [framework, files] of rendered) {
      for (const [file, content] of files) {
        expect(content, `${framework}:${file}`).not.toContain(os.homedir());
        expect(content, `${framework}:${file}`).not.toMatch(homePath);
      }
    }
  });

  it('keeps the committed example free of real secrets and gitignores the local file', () => {
    for (const [framework, files] of rendered) {
      const example = files.get('.env.example') ?? '';
      expect(example, `${framework} must ship .env.example`).toBeTruthy();

      // Only the API generators hold a signing key. A web client has no secret
      // of its own — it never signs anything — so it declares none.
      if (/_SECRET=/.test(example)) {
        expect(example, framework).toContain('replace-me');
      }

      const gitignore = files.get('.gitignore') ?? '';
      expect(gitignore, `${framework} must gitignore .env`).toContain('.env');
    }
  });

  it('gives every project a distinct, generated secret', () => {
    const secrets = new Set<string>();

    for (const [framework, files] of rendered) {
      // Next.js reads .env.local; the others read .env.
      const local = files.get('.env') ?? files.get('.env.local') ?? '';
      const match = /_SECRET=(.+)/.exec(local);
      if (!match) continue;

      const secret = (match[1] ?? '').trim();
      expect(secret, framework).not.toContain('replace-me');
      expect(secret.length, framework).toBeGreaterThanOrEqual(32);
      secrets.add(secret);
    }

    // Every generated project must get its own key, never a shared constant.
    expect(secrets.size).toBeGreaterThan(1);
  });

  it('runs every container as a non-root user', () => {
    for (const [framework, files] of rendered) {
      const dockerfile = files.get('Dockerfile');
      expect(dockerfile, `${framework} must ship a Dockerfile`).toBeTruthy();
      expect(dockerfile, framework).toContain('USER node');
    }
  });

  it('never bakes a secret into a container image', () => {
    for (const [framework, files] of rendered) {
      const dockerfile = files.get('Dockerfile') ?? '';
      // A placeholder URL for the build is fine; a credential is not.
      expect(dockerfile, framework).not.toMatch(/ENV\s+\w*(SECRET|PASSWORD|TOKEN|KEY)\w*=/i);
    }
  });

  it('never ships a plaintext password or a bare token in any source file', () => {
    // Deliberately crude: the point is to catch a real credential pasted into a
    // template, which is what a scaffolder must never do.
    const suspicious = /(password|secret|api[_-]?key)\s*[:=]\s*['"][A-Za-z0-9+/=_-]{16,}['"]/i;

    for (const [framework, files] of rendered) {
      for (const [file, content] of files) {
        if (!file.startsWith('src/')) continue;
        // Specs carry obvious fixtures such as
        // `JWT_ACCESS_SECRET: 'test-secret-...'`, which is the point of them.
        if (file.includes('.spec.')) continue;
        expect(content, `${framework}:${file}`).not.toMatch(suspicious);
      }
    }
  });

  it('documents itself for humans and for agents', () => {
    for (const [framework, files] of rendered) {
      for (const doc of ['README.md', 'ARCHITECTURE.md', 'CONVENTIONS.md', 'AGENTS.md']) {
        expect(files.get(doc), `${framework} must ship ${doc}`).toBeTruthy();
      }
    }
  });

  it('describes the real configuration in ARCHITECTURE.md', () => {
    for (const [framework, files] of rendered) {
      const architecture = files.get('ARCHITECTURE.md') ?? '';
      expect(architecture, framework).toContain(`| Framework | ${framework} |`);
    }
  });
});

describe('web clients keep tokens on the server', () => {
  it('never reads a session token from client code', () => {
    for (const framework of ['nextjs', 'svelte'] as const) {
      const files = rendered.get(framework);
      expect(files, framework).toBeTruthy();
      if (!files) continue;

      for (const [file, content] of files) {
        // Source files only: AGENTS.md quotes `'use client'` in a rule about it.
        if (!file.startsWith('src/')) continue;

        const isClient =
          content.includes("'use client'") ||
          (file.endsWith('.svelte') && !file.includes('server'));
        if (!isClient) continue;

        expect(content, `${framework}:${file}`).not.toMatch(/localStorage|sessionStorage/);
        expect(content, `${framework}:${file}`).not.toMatch(/accessToken|refreshToken/);
      }
    }
  });
});
