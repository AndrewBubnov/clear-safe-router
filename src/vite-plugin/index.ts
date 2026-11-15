import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Plugin } from 'vite';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

export type TypedRouterPluginOptions = {
  routesDirectory?: string;
  generatedFile?: string;
};

export const typedRouter = (options: TypedRouterPluginOptions = {}): Plugin => {
  let root = process.cwd();
  let routeDir = path.resolve(root, options.routesDirectory ?? 'src/routes');
  let generatedFile = path.resolve(root, options.generatedFile ?? 'src/routeTree.gen.ts');
  let server: import('vite').ViteDevServer | undefined;

  const generate = () => {
    try {
      execFileSync(process.execPath, [path.join(packageRoot, 'scripts/generate-routes.mjs')], {
        cwd: packageRoot,
        env: {
          ...process.env,
          TYPED_ROUTER_ROOT: root,
          TYPED_ROUTER_ROUTES: path.relative(root, routeDir),
          TYPED_ROUTER_OUTPUT: path.relative(root, generatedFile),
        },
        stdio: 'pipe',
      });
      return true;
    } catch (error) {
      const details = error as { stderr?: Buffer; message?: string };
      const message = details.stderr?.toString() || details.message || String(error);
      if (server) server.config.logger.error(message.trim());
      else throw new Error(message.trim());
      return false;
    }
  };

  const isRouteFile = (file: string) => file === routeDir || file.startsWith(routeDir + path.sep);

  return {
    name: 'typed-router:file-routes',
    enforce: 'pre',
    configResolved(config) {
      root = config.root;
      routeDir = path.resolve(root, options.routesDirectory ?? 'src/routes');
      generatedFile = path.resolve(root, options.generatedFile ?? 'src/routeTree.gen.ts');
    },
    buildStart() {
      generate();
    },
    configureServer(devServer) {
      server = devServer;
      devServer.watcher.add(routeDir);
      const regenerate = (file: string) => {
        if (!isRouteFile(file)) return;
        if (generate()) devServer.ws.send({ type: 'full-reload' });
      };
      devServer.watcher.on('add', regenerate);
      devServer.watcher.on('unlink', regenerate);
      devServer.watcher.on('change', regenerate);
      devServer.watcher.on('unlinkDir', regenerate);
      devServer.watcher.on('addDir', regenerate);
    },
    handleHotUpdate(context) {
      if (!isRouteFile(context.file)) return;
      if (generate()) {
        const module = context.server.moduleGraph.getModuleById(generatedFile);
        if (module) return [module];
        context.server.ws.send({ type: 'full-reload' });
      }
      return [];
    },
  };
};
