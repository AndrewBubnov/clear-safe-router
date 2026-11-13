import { LAZY_MARKER } from '../constants';
import type { LazyComponent } from '../types';

/** Marks a route component as code-split: the chunk loads on first render and is preloaded by Link prefetch. */
export const lazy = (importFn: LazyComponent['importFn']): LazyComponent => ({ [LAZY_MARKER]: true, importFn });
