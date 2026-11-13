import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const typedRouter = (options = {}) => {
    let root = process.cwd();
    let routeDir = path.resolve(root, options.routesDirectory ?? 'src/routes');
    let generatedFile = path.resolve(root, options.generatedFile ?? 'src/routeTree.gen.ts');
    let server;
    const generate = () => {
        try {
            execFileSync(process.execPath, [path.join(packageRoot, 'scripts/generate-routes.mjs')], {
                cwd: packageRoot,
                env: { ...process.env, TYPED_ROUTER_ROOT: root },
                stdio: 'pipe',
            });
            return true;
        }
        catch (error) {
            const details = error;
            const message = details.stderr?.toString() || details.message || String(error);
            if (server)
                server.config.logger.error(message.trim());
            else
                throw new Error(message.trim());
            return false;
        }
    };
    const isRouteFile = (file) => file === routeDir || file.startsWith(routeDir + path.sep);
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
            const regenerate = (file) => {
                if (!isRouteFile(file))
                    return;
                if (generate())
                    devServer.ws.send({ type: 'full-reload' });
            };
            devServer.watcher.on('add', regenerate);
            devServer.watcher.on('unlink', regenerate);
            devServer.watcher.on('change', regenerate);
            devServer.watcher.on('unlinkDir', regenerate);
            devServer.watcher.on('addDir', regenerate);
        },
        handleHotUpdate(context) {
            if (!isRouteFile(context.file))
                return;
            if (generate()) {
                const module = context.server.moduleGraph.getModuleById(generatedFile);
                if (module)
                    return [module];
                context.server.ws.send({ type: 'full-reload' });
            }
            return [];
        },
    };
};
