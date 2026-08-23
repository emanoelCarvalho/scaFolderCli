import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ProjectFiles } from '../../src/fs/project-files.js';
import { applyLayers, renderTemplateString } from '../../src/template/engine.js';
import { isRenderable, outputPathFor } from '../../src/template/paths.js';
import { buildTemplateData } from '../../src/template/data.js';
import type { ProjectConfig } from '../../src/config/schema.js';
import { isScafolderError } from '../../src/util/errors.js';

const config: ProjectConfig = {
  projectName: 'my-api',
  framework: 'nestjs',
  projectType: 'api',
  architecture: 'modular',
  database: 'postgresql',
  orm: 'prisma',
  authentication: 'jwt',
  repositoryPattern: true,
  testing: 'vitest',
  docker: true,
  aiDocumentation: true,
  packageManager: 'npm',
};

let templatesRoot: string;
let projectRoot: string;

beforeEach(async () => {
  templatesRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'scafolder-templates-'));
  projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'scafolder-project-'));
});

afterEach(async () => {
  await fs.rm(templatesRoot, { recursive: true, force: true });
  await fs.rm(projectRoot, { recursive: true, force: true });
});

async function writeTemplate(relativePath: string, content: string): Promise<void> {
  const target = path.join(templatesRoot, relativePath);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, content);
}

describe('outputPathFor', () => {
  it('strips the .eta suffix', () => {
    expect(outputPathFor('src/main.ts.eta')).toBe('src/main.ts');
  });

  it('turns a leading underscore into a dot, since npm strips real dotfiles', () => {
    expect(outputPathFor('_gitignore.eta')).toBe('.gitignore');
    expect(outputPathFor('_github/workflows/ci.yml.eta')).toBe('.github/workflows/ci.yml');
  });

  it('leaves plain files alone', () => {
    expect(outputPathFor('src/main.ts')).toBe('src/main.ts');
  });

  it('does not treat an underscore inside a segment as a dot', () => {
    expect(outputPathFor('src/my_file.ts')).toBe('src/my_file.ts');
  });
});

describe('isRenderable', () => {
  it('only renders .eta files', () => {
    expect(isRenderable('a.ts.eta')).toBe(true);
    expect(isRenderable('a.ts')).toBe(false);
  });
});

describe('renderTemplateString', () => {
  const data = buildTemplateData(config);

  it('interpolates values', () => {
    expect(renderTemplateString('name: <%= it.projectName %>', data, 'test')).toBe('name: my-api');
  });

  it('does not HTML-escape, because it emits source code', () => {
    expect(renderTemplateString('<%= it.raw %>', { raw: 'a && b > c' }, 'test')).toBe('a && b > c');
  });

  it('supports conditional blocks with whitespace control', () => {
    const template = ['a', '<% if (it.hasAuth) { -%>', 'auth', '<% } -%>', 'b'].join('\n');
    expect(renderTemplateString(template, data, 'test')).toBe('a\nauth\nb');
    expect(renderTemplateString(template, { hasAuth: false }, 'test')).toBe('a\nb');
  });

  it('reports the template origin when rendering fails', () => {
    try {
      renderTemplateString('<%= it.missing.deep %>', {}, 'layers/broken.ts.eta');
      expect.unreachable('should have thrown');
    } catch (error) {
      expect(isScafolderError(error)).toBe(true);
      if (isScafolderError(error)) expect(error.message).toContain('layers/broken.ts.eta');
    }
  });
});

describe('applyLayers', () => {
  it('renders .eta files and copies everything else verbatim', async () => {
    await writeTemplate('base/README.md.eta', '# <%= it.projectName %>');
    await writeTemplate('base/static.txt', 'unchanged <%= not-a-template %>');

    const files = new ProjectFiles(projectRoot);
    await applyLayers(files, [{ dir: 'base' }], buildTemplateData(config), { templatesRoot });

    expect(await files.read('README.md')).toBe('# my-api\n');
    expect(await files.read('static.txt')).toBe('unchanged <%= not-a-template %>\n');
  });

  it('lets a later layer override an earlier one', async () => {
    await writeTemplate('base/config.ts.eta', 'base');
    await writeTemplate('override/config.ts.eta', 'override');

    const files = new ProjectFiles(projectRoot);
    await applyLayers(files, [{ dir: 'base' }, { dir: 'override' }], buildTemplateData(config), {
      templatesRoot,
    });

    expect(await files.read('config.ts')).toBe('override\n');
  });

  it('skips a layer whose condition is false', async () => {
    await writeTemplate('auth/auth.ts.eta', 'auth');
    const files = new ProjectFiles(projectRoot);
    await applyLayers(files, [{ dir: 'auth', when: false }], buildTemplateData(config), {
      templatesRoot,
    });
    expect(files.plannedWrites()).toEqual([]);
  });

  it('applies an output prefix', async () => {
    await writeTemplate('module/service.ts.eta', 'x');
    const files = new ProjectFiles(projectRoot);
    await applyLayers(
      files,
      [{ dir: 'module', outputPrefix: 'src/modules/users' }],
      buildTemplateData(config),
      { templatesRoot },
    );
    expect(files.plannedWrites()).toEqual(['src/modules/users/service.ts']);
  });

  it('fails loudly on a missing layer instead of generating an incomplete project', async () => {
    const files = new ProjectFiles(projectRoot);
    await expect(
      applyLayers(files, [{ dir: 'typo' }], buildTemplateData(config), { templatesRoot }),
    ).rejects.toMatchObject({ code: 'TEMPLATE_NOT_FOUND' });
  });
});
