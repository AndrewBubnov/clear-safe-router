import { lazy as reactLazy, type ComponentType } from 'react';
import { LAZY_MARKER } from '../constants';
import type { LazyComponent } from '../types';

const lazyCache = new WeakMap<LazyComponent, ComponentType<any>>();

/** Resolves a plain component, a `lazy()` definition, or a wrapped component
 * (React.memo / forwardRef / React.lazy — objects carrying `$$typeof`) into a
 * renderable component. */
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
  if (typeof component === 'object' && typeof (component as { $$typeof?: unknown }).$$typeof === 'symbol') {
    // memo(...) / forwardRef(...) / React.lazy(...) are valid element types as-is.
    // One special case: memo() wrapping one of OUR lazy() definitions — the inner
    // definition is not a React element type, so resolve it recursively.
    const memoType = (component as { type?: unknown }).type;
    if (memoType && typeof memoType === 'object' && LAZY_MARKER in memoType) return resolveComponent(memoType);
    return component as ComponentType;
  }
  return null;
};
