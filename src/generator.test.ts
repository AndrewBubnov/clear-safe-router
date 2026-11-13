import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { afterEach, describe, expect, it } from 'vitest';

const script = path.resolve('scripts/generate-routes.mjs');
const dirs: string[] = [];
const createFixture = async (files: Record<string, string>) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'typed-router-'));
  dirs.push(root);
  for (const [name, content] of Object.entries(files)) {
    const file = path.join(root, 'src/routes', name);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, content);
  }
  return root;
};
const route = (id: string) => `import { createFileRoute } from '../../index';\nexport const Route = createFileRoute('${id}')({});\n`;
const generate = (root: string) => execFileSync(process.execPath, [script], { env: { ...process.env, TYPED_ROUTER_ROOT: root }, encoding: 'utf8', stdio: 'pipe' });

afterEach(async () => { await Promise.all(dirs.splice(0).map(dir => rm(dir, { recursive: true, force: true }))); });

describe('file route generator', () => {
  it('generates deterministic root/index/static/dynamic/nested/wildcard trees', async () => {
    const root = await createFixture({
      '__root.tsx': route('__root__'),
      'index.tsx': route('/'),
      'products/route.tsx': route('/products'),
      'products/index.tsx': route('/products/'),
      'products/$id.tsx': route('/products/$id'),
      'products/reviews/route.tsx': route('/products/reviews'),
      '$.tsx': route('/$'),
    });
    const run1 = generate(root);
    const generatedPath = path.join(root, 'src/routeTree.gen.ts');
    const contents1 = await readFile(generatedPath, 'utf8');
    const run2 = generate(root);
    expect(run1).toContain('generated 7 routes');
    expect(run2).toContain('generated 7 routes');
    expect(await readFile(generatedPath, 'utf8')).toBe(contents1);
    expect(contents1).toContain('"/products/:id"');
    expect(contents1).toContain('"/products/"');
    expect(contents1).toContain('"/*"');
  });

  it('reports missing parents and malformed file IDs with source path', async () => {
    const missingParent = await createFixture({ '__root.tsx': route('__root__'), 'loose/child.tsx': route('/loose/child') });
    expect(() => generate(missingParent)).toThrow(/loose[\\/]route\.tsx.*no route\.tsx parent/);
    const mismatch = await createFixture({ '__root.tsx': route('__root__'), 'about.tsx': route('/wrong') });
    expect(() => generate(mismatch)).toThrow(/about\.tsx.*expected export const Route/);
  });

  it('reports invalid route names and duplicate route patterns', async () => {
    const invalid = await createFixture({ '__root.tsx': route('__root__'), 'bad name.tsx': route('/bad name') });
    expect(() => generate(invalid)).toThrow(/bad name\.tsx.*invalid route filename/);
    const conflict = await createFixture({ '__root.tsx': route('__root__'), '$id.tsx': route('/$id'), '$name.tsx': route('/$name') });
    expect(() => generate(conflict)).toThrow(/route path conflicts/);
  });

  it('reports pathless layout folders and duplicate parameter names', async () => {
    const pathless = await createFixture({ '__root.tsx': route('__root__'), '(auth)/index.tsx': route('/(auth)/') });
    expect(() => generate(pathless)).toThrow(/\(auth\)[\\/]route\.tsx.*no route\.tsx parent/);
    const duplicate = await createFixture({
      '__root.tsx': route('__root__'),
      'products/route.tsx': route('/products'),
      'products/$id/route.tsx': route('/products/$id'),
      'products/$id/$id.tsx': route('/products/$id/$id'),
    });
    expect(() => generate(duplicate)).toThrow(/dynamic parameter names must be unique/);
  });

  it('allows a static sibling to overlap a dynamic route without ambiguity', async () => {
    const root = await createFixture({
      '__root.tsx': route('__root__'),
      'products/route.tsx': route('/products'),
      'products/$id.tsx': route('/products/$id'),
      'products/new.tsx': route('/products/new'),
      '$.tsx': route('/$'),
    });
    expect(generate(root)).toContain('generated 5 routes');
    const contents = await readFile(path.join(root, 'src/routeTree.gen.ts'), 'utf8');
    expect(contents).toContain('"/products/:id"');
    expect(contents).toContain('"/products/new"');
    expect(contents).toContain('"/*"');
  });
});
