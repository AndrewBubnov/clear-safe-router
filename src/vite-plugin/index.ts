import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Plugin } from 'vite';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

export type TypedRouterPluginOptions = {
  routesDirectory?: string;
  generatedFile?: string;
};

export const clearSafeRouter = (options: TypedRouterPluginOptions = {}): Plugin => {
  let root = process.cwd();
  let routeDir = path.resolve(root, options.routesDirectory ?? 'src/routes');
  let generatedFile = path.resolve(root, options.generatedFile ?? 'src/routeTree.gen.ts');
  let server: import('vite').ViteDevServer | undefined;
  // One-line discovery hint: an agent driving the dev server learns the
  // package ships an AI skill (SKILL.md is invisible inside node_modules).
  let hinted = false;
  const hintSkill = () => {
    if (hinted || process.env.CLEAR_ROUTER_NO_HINTS) return;
    hinted = true;
    console.log('[clear-safe-router] AI skill: run `npx clear-safe-router skill install` to add it to your agent\'s skills directory');
  };

  /** Runs the generator and reports whether the generated file actually changed.
   * Content-identical regeneration (a route-file edit that does not change the
   * tree) must not trigger a full reload. */
  const generate = (): 'changed' | 'unchanged' | 'error' => {
    let before: string | undefined;
    try { before = readFileSync(generatedFile, 'utf8'); } catch { /* first run */ }
    try {
      execFileSync(process.execPath, [path.join(packageRoot, 'scripts/generate-routes.mjs')], {
        cwd: packageRoot,
        env: {
          ...process.env,
          CLEAR_ROUTER_ROOT: root,
          CLEAR_ROUTER_ROUTES: path.relative(root, routeDir),
          CLEAR_ROUTER_OUTPUT: path.relative(root, generatedFile),
        },
        stdio: 'pipe',
      });
      let after: string | undefined;
      try { after = readFileSync(generatedFile, 'utf8'); } catch { return 'error'; }
      return after !== before ? 'changed' : 'unchanged';
    } catch (error) {
      const details = error as { stderr?: Buffer; message?: string };
      const message = details.stderr?.toString() || details.message || String(error);
      if (server) server.config.logger.error(message.trim());
      else throw new Error(message.trim());
      return 'error';
    }
  };

  // Vite watcher events carry forward slashes even on Windows, while routeDir
  // is a native path — compare in posix form on both sides.
  const toPosix = (value: string) => value.replace(/\\/g, '/');
  const isRouteFile = (file: string) => {
    const posixFile = toPosix(file);
    const posixDir = toPosix(routeDir);
    return posixFile === posixDir || posixFile.startsWith(`${posixDir}/`);
  };

  return {
    name: 'clear-safe-router:file-routes',
    enforce: 'pre',
    configResolved(config) {
      root = config.root;
      routeDir = path.resolve(root, options.routesDirectory ?? 'src/routes');
      generatedFile = path.resolve(root, options.generatedFile ?? 'src/routeTree.gen.ts');
    },
    buildStart() {
      hintSkill();
      generate();
    },
    configureServer(devServer) {
      server = devServer;
      devServer.watcher.add(routeDir);
      // Only structural events here — file 'change' is owned by handleHotUpdate,
      // otherwise every edit would generate twice.
      const regenerate = (file: string) => {
        if (!isRouteFile(file)) return;
        if (generate() === 'changed') devServer.ws.send({ type: 'full-reload' });
      };
      devServer.watcher.on('add', regenerate);
      devServer.watcher.on('unlink', regenerate);
      devServer.watcher.on('unlinkDir', regenerate);
      devServer.watcher.on('addDir', regenerate);
    },
    handleHotUpdate(context) {
      if (!isRouteFile(context.file)) return;
      const result = generate();
      if (result === 'changed') {
        const module = context.server.moduleGraph.getModuleById(generatedFile);
        if (module) return [module];
        context.server.ws.send({ type: 'full-reload' });
        return [];
      }
      // 'unchanged'/'error': returning an array would tell Vite "update nothing";
      // return undefined so the default pipeline HMR-updates the edited route module.
    },
  };
};
