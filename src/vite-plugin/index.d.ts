import type { Plugin } from 'vite';
export type TypedRouterPluginOptions = {
    routesDirectory?: string;
    generatedFile?: string;
};
export declare const typedRouter: (options?: TypedRouterPluginOptions) => Plugin;
