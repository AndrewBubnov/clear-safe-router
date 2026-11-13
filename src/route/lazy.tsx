import { lazy as reactLazy, type ComponentType } from 'react';
import { LAZY_MARKER } from '../constants';
import type { LazyComponent } from '../types';

const lazyCache = new WeakMap<LazyComponent, ComponentType<any>>();

/** Resolves a plain component or a `lazy()` definition into a renderable component. */
export const resolveComponent = (component: unknown): ComponentType<any> | null => {
  if (!component) return null;
  if (typeof component === 'function') return component as ComponentType;
  if (typeof component === 'object' && LAZY_MARKER in component) {
    const definition = component as LazyComponent;
    let resolved: ComponentType<any> | undefined = lazyCache.get(definition);
    if (!resolved) {
      resolved = reactLazy<ComponentType<any>>(() => definition.importFn().then(module => ({ default: module.default as ComponentType })));
      lazyCache.set(definition, resolved);
    }
    return resolved;
  }
  return null;
};
