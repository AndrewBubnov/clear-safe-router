// Smoke-test the published artifact without installing anything: pack the
// package, extract the tarball, and verify that everything the package
// promises actually ships — every `exports` target, plus any package-relative
// path referenced from dist code. The 0.1.8 tarball was broken exactly this
// way (the vite plugin spawned scripts/generate-routes.mjs, which `files`
// did not include), and no local check would have caught it.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// npm is not resolvable as a module (its exports map hides the CLI), so look
// for the CLI next to the running node first, and fall back to a shell spawn.
const npmCli = path.join(path.dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js');
// CSR_SMOKE_PACKAGE_ROOT: test hook — packs a different package directory.
const packageRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  process.env.CSR_SMOKE_PACKAGE_ROOT ?? '..',
);
const tmp = mkdtempSync(path.join(os.tmpdir(), 'csr-smoke-'));
try {
  const packArgs = ['pack', '--json', '--pack-destination', tmp];
  const packed = existsSync(npmCli)
    ? execFileSync(process.execPath, [npmCli, ...packArgs], { cwd: packageRoot, encoding: 'utf8' })
    : execFileSync('npm', packArgs, { cwd: packageRoot, encoding: 'utf8', shell: true });
  const tarball = JSON.parse(packed)[0].filename;
  // Run tar inside the temp dir with relative names: GNU tar reads a leading
  // `C:` in a path as a remote host spec.
  execFileSync('tar', ['-xzf', tarball], { cwd: tmp, stdio: 'pipe' });

  const pkgDir = path.join(tmp, 'package');
  const manifest = JSON.parse(readFileSync(path.join(pkgDir, 'package.json'), 'utf8'));
  const missing = [];
  const check = (label, rel) => {
    if (rel && typeof rel === 'string' && !existsSync(path.join(pkgDir, rel)))
      missing.push(`${rel} (${label})`);
  };
  check('main', manifest.main);
  check('module', manifest.module);
  check('types', manifest.types);
  for (const [key, target] of Object.entries(manifest.exports ?? {})) {
    const values =
      typeof target === 'string' ? [target] : Object.values(target ?? {});
    for (const value of values) if (typeof value === 'string') check(`exports "${key}"`, value);
  }

  // Any package-relative .mjs path literal inside dist must exist in the
  // tarball — this is the generator seam the plugin spawns.
  const distFiles = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else distFiles.push(full);
    }
  };
  walk(path.join(pkgDir, 'dist'));
  for (const file of distFiles.filter((f) => f.endsWith('.js'))) {
    const source = readFileSync(file, 'utf8');
    for (const match of source.matchAll(/["']([\w./\\-]+\.mjs)["']/g)) {
      const ref = match[1].replaceAll('\\\\', '/');
      if (existsSync(path.join(pkgDir, ref))) continue;
      if (existsSync(path.join(path.dirname(file), ref))) continue;
      missing.push(`${ref} (referenced by ${path.relative(pkgDir, file)})`);
    }
  }

  if (missing.length) {
    console.error(`[smoke-pack] ${tarball} is missing files:\n  ${[...new Set(missing)].join('\n  ')}`);
    process.exitCode = 1;
  } else {
    console.log(`[smoke-pack] ${tarball}: all export targets and dist references ship.`);
  }
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
