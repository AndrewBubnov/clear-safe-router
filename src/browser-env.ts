/**
 * Browser implementation of the platform seam. Lives in the adapter layer:
 * importing it requires DOM lib types, while `core/env.ts` stays DOM-free.
 * The React barrel (`src/runtime/index.ts`) wires it when a window exists.
 */
import type { RouterEnv } from './core/env';

export const browserEnv: RouterEnv = {
  currentLocation: () => ({
    pathname: window.location.pathname,
    search: window.location.search,
    state: window.history.state,
  }),
  currentUrl: () => `${window.location.pathname}${window.location.search}`,
  push: (url, state) => window.history.pushState(state ?? null, '', url),
  replace: (url, state) => window.history.replaceState(state ?? null, '', url),
  back: () => window.history.back(),
  forward: () => window.history.forward(),
  onPopState: (listener) => {
    window.addEventListener('popstate', listener);
    return () => window.removeEventListener('popstate', listener);
  },
  startViewTransition: (write, durationMs) => {
    if (durationMs !== undefined)
      document.documentElement.style.setProperty(
        '--pg-transition-duration',
        `${durationMs}ms`,
      );
    try {
      const transition = document.startViewTransition(write);
      transition.finished.catch(() => {});
    } catch {
      write();
    }
  },
  scrollTo: (options) => window.scrollTo(options),
  scrollPos: () => ({
    top: document.scrollingElement?.scrollTop ?? window.scrollY,
    left: document.scrollingElement?.scrollLeft ?? window.scrollX,
  }),
  elementById: (id) => document.getElementById(id),
  scrollElementTo: (element, options) =>
    // The element contract is structural; in a browser it is always a real
    // Element, which has `scrollTo`.
    (element as HTMLElement).scrollTo(options as ScrollToOptions),
  elementScrollPos: (element) => ({
    top: (element as HTMLElement).scrollTop,
    left: (element as HTMLElement).scrollLeft,
  }),
  isSmallTouchDevice: () =>
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(pointer: coarse)').matches &&
    window.matchMedia('(max-width: 768px)').matches,
  isVisible: () => document.visibilityState === 'visible',
  onVisibilityChange: (listener) => {
    const handler = () => listener();
    document.addEventListener('visibilitychange', handler);
    return () => document.removeEventListener('visibilitychange', handler);
  },
  onOnline: (listener) => {
    window.addEventListener('online', listener);
    return () => window.removeEventListener('online', listener);
  },
};
