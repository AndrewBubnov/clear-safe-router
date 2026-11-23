/**
 * The platform seam. The core never touches `window`, `document` or `history`
 * directly: every DOM-capable operation goes through this interface, so the
 * same kernel runs in a browser, under a memory history (tests/headless) or
 * fully headless (`nullEnv`). The React adapter wires `browserEnv`; a non-DOM
 * host simply supplies its own implementation.
 *
 * This module is DOM-lib-free: element and scroll option shapes are structural,
 * so `dist/types/core` compiles in a TypeScript project without `lib: DOM`.
 */

export type ScrollBehaviorName = 'auto' | 'smooth' | 'instant';
export type EnvScrollOptions = { top?: number; left?: number; behavior?: ScrollBehaviorName };
/** Structural stand-in for a scrollable anchor element — a real DOM Element
 * satisfies it; custom envs only need these members, not the DOM interface. */
export type EnvScrollElement = {
  scrollHeight: number;
  clientHeight: number;
  scrollTop: number;
  scrollLeft: number;
};

export interface RouterEnv {
  /** Read the current location (pathname + search + history state). */
  currentLocation(): { pathname: string; search: string; state: unknown };
  /** Current URL as `pathname + search` (popstate revert checks). */
  currentUrl(): string;
  push(url: string, state: unknown): void;
  replace(url: string, state: unknown): void;
  /** Traverses history backwards/forwards. Contract: a traversal must end with
   * an `onPopState` callback — the core only reacts to that event. Real history
   * fires it asynchronously; a synchronous memory implementation must call the
   * listeners itself after moving. */
  back(): void;
  forward(): void;
  /** History event subscription (popstate); return an unsubscribe function. */
  onPopState(listener: () => void): () => void;
  /** View transitions; omit or leave undefined to commit synchronously. */
  startViewTransition?(write: () => void, durationMs?: number): void;
  /** Scroll surface — only used when a route enables `scrollRestoration`. */
  scrollTo(options: EnvScrollOptions): void;
  /** Page scroll position (scrolling element, falling back to window). */
  scrollPos(): { top: number; left: number };
  elementById(id: string): EnvScrollElement | null;
  scrollElementTo(
    element: EnvScrollElement,
    options: EnvScrollOptions,
  ): void;
  /** Both axes of an anchor element; the core picks the meaningful one. */
  elementScrollPos(element: EnvScrollElement): { top: number; left: number };
  /** Prefetch concurrency hint: small touch screens prefetch 2-at-a-time. */
  isSmallTouchDevice(): boolean;
  /** Focus/online revalidation surface; no-op implementations allowed. */
  isVisible(): boolean;
  onVisibilityChange(listener: () => void): () => void;
  onOnline(listener: () => void): () => void;
}

const stubUnsubscribe = () => {};
/** Headless fallback: a stable in-memory location, inert history and scroll. */
export const nullEnv: RouterEnv = {
  currentLocation: () => ({ pathname: '/', search: '', state: null }),
  currentUrl: () => '/',
  push: () => {},
  replace: () => {},
  back: () => {},
  forward: () => {},
  onPopState: () => stubUnsubscribe,
  scrollTo: () => {},
  scrollPos: () => ({ top: 0, left: 0 }),
  elementById: () => null,
  scrollElementTo: () => {},
  elementScrollPos: () => ({ top: 0, left: 0 }),
  isSmallTouchDevice: () => false,
  isVisible: () => false,
  onVisibilityChange: () => stubUnsubscribe,
  onOnline: () => stubUnsubscribe,
};

let env: RouterEnv = nullEnv;

/** Replace the platform implementation (e.g. with a memory history in tests). */
export const setRouterEnv = (next: RouterEnv) => {
  env = next;
};
export const getRouterEnv = (): RouterEnv => env;
