import { useEffect, useRef, type CSSProperties, type MouseEventHandler, type ReactElement, type ReactNode, type MouseEvent } from 'react';
import type { DefaultPrefetch, ElementProps, LinkProps, LinkState } from './types';
import { resolveTarget, routerConfig, routerRuntime, useLinkState } from './runtime';
import { getRouterEnv } from './core/env';

const isMobile = () => getRouterEnv().isSmallTouchDevice();

export const Link = (props: LinkProps) => {
  const {
    to, toRaw, params, search, state, replace, onClick: onClickProp, onMouseEnter: onMouseEnterProp, onMouseLeave: onMouseLeaveProp, target, download,
    children, className: classNameInput, activeClassName = 'active-link', pendingClassName = 'pending-link', style: styleInput,
    prefetch: linkPrefetch = 'auto', hoverPrefetchDelay, beforeNavigate, exact = false, as, ...restProps
  } = props as LinkProps & {
    to?: string; toRaw?: string; params?: Record<string, string | number>;
    search?: string | Record<string, string | number | boolean | null | undefined>; state?: unknown; replace?: boolean;
    children?: ReactNode; className?: string | ((state: LinkState) => string);
    activeClassName?: string; pendingClassName?: string; style?: CSSProperties | ((state: LinkState) => CSSProperties);
    prefetch?: DefaultPrefetch; hoverPrefetchDelay?: number; beforeNavigate?: () => Promise<void>;
    as?: (props: ElementProps<HTMLAnchorElement>, state: LinkState) => ReactElement;
    onClick?: MouseEventHandler<HTMLAnchorElement>; onMouseEnter?: MouseEventHandler<HTMLAnchorElement>; onMouseLeave?: MouseEventHandler<HTMLAnchorElement>;
    target?: string; download?: unknown;
  };
  const className = classNameInput as string | ((state: LinkState) => string) | undefined;
  const style = styleInput as CSSProperties | ((state: LinkState) => CSSProperties) | undefined;
  const hoverTimeout = useRef(0);
  const paramWarnedRef = useRef(false);
  // A missing route parameter must not crash the whole tree in render: Link
  // degrades to a disabled anchor and warns instead of throwing.
  const resolved = (() => {
    try {
      return resolveTarget({ to: to as string | undefined, toRaw, params, search, state });
    } catch (error) {
      if (!paramWarnedRef.current) {
        paramWarnedRef.current = true;
        console.warn(`[clear-safe-router] Link: cannot resolve target${to ? ` "${to}"` : ''} — rendering a disabled link:`, error);
      }
      return null;
    }
  })();
  const targetPath = resolved ? `${resolved.pathname}${resolved.search}` : "";
  const anchorRef = useRef<HTMLAnchorElement>(null);
  const { isActive, isPending } = useLinkState(resolved?.pathname ?? '', resolved?.search ?? '', exact);
  const resolveStrategy = (): 'hover' | 'render' | 'viewport' | 'none' => {
    if (linkPrefetch !== 'auto') return linkPrefetch as 'hover' | 'render' | 'viewport' | 'none';
    // 'auto' resolves against the live config so a changed defaultPrefetch
    // applies to the next hover without waiting for a Link re-render.
    if (routerConfig.defaultPrefetch !== 'auto') return routerConfig.defaultPrefetch as 'hover' | 'render' | 'viewport' | 'none';
    return isMobile() ? 'viewport' : 'hover';
  };
  const strategy: 'hover' | 'render' | 'viewport' | 'none' = resolveStrategy();
  useEffect(() => {
    if (!resolved || strategy === 'render') {
      // The effect owns the render-prefetch attempt: teardown (unmount or a
      // changed target) aborts the in-flight guard/loader work.
      const controller = new AbortController();
      void routerRuntime.prefetch(targetPath, controller.signal);
      return () => controller.abort();
    }
    if (!resolved || strategy !== 'viewport') return;
    const element = anchorRef.current;
    if (!element || typeof IntersectionObserver === 'undefined') return;
    let dwellTimer = 0;
    let controller: AbortController | null = null;
    const observer = new IntersectionObserver(entries => {
      const isVisible = entries[entries.length - 1]!.isIntersecting;
      window.clearTimeout(dwellTimer);
      if (!isVisible) { controller?.abort(); controller = null; return; }
      dwellTimer = window.setTimeout(() => {
        const attempt = new AbortController();
        controller = attempt;
        // The attempt's signal rides through guards and loaders: leaving the
        // viewport aborts the prefetch mid-flight. The observer stays connected
        // — a denied prefetch (guards said no) must be retryable on the next
        // dwell instead of silently never firing again.
        void routerRuntime.prefetch(targetPath, attempt.signal);
      }, 250);
    });
    observer.observe(element);
    return () => { window.clearTimeout(dwellTimer); controller?.abort(); observer.disconnect(); };
  }, [strategy, targetPath]);
  useEffect(() => {
    if (!resolved || strategy !== 'hover') return;
    return () => { if (hoverTimeout.current) window.clearTimeout(hoverTimeout.current); };
  }, [strategy, resolved]);
  const onClick: MouseEventHandler<HTMLAnchorElement> = async event => {
    onClickProp?.(event);
    if (!resolved) { event.preventDefault(); return; }
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    if (target && target !== '_self') return;
    if (download !== undefined) return;
    event.preventDefault();
    // A rejected beforeNavigate must not become an unhandled rejection: log it
    // and stay on the page.
    try {
      await beforeNavigate?.();
    } catch (error) {
      console.error('[clear-safe-router] Link beforeNavigate failed:', error);
      return;
    }
    void routerRuntime.navigate({ toRaw: targetPath, state, replace });
  };
  const onMouseEnter = (event: MouseEvent<HTMLAnchorElement>) => {
    onMouseEnterProp?.(event);
    if (!resolved || resolveStrategy() !== 'hover') return;
    const delay = hoverPrefetchDelay ?? routerConfig.defaultHoverPrefetchDelay;
    if (!delay) return;
    if (hoverTimeout.current) window.clearTimeout(hoverTimeout.current);
    hoverTimeout.current = window.setTimeout(() => { void routerRuntime.prefetch(targetPath); }, delay);
  };
  const onMouseLeave = (event: MouseEvent<HTMLAnchorElement>) => {
    onMouseLeaveProp?.(event);
    if (!resolved || resolveStrategy() !== 'hover') return;
    if (hoverTimeout.current) { window.clearTimeout(hoverTimeout.current); hoverTimeout.current = 0; }
  };
  const normalizedClassName = typeof className === 'function' ? className({ isActive, isPending }) : className;
  const normalizedStyle = typeof style === 'function' ? style({ isActive, isPending }) : style;
  const resultClassName = [isActive && activeClassName, isPending && pendingClassName, normalizedClassName].filter(Boolean).join(' ');
  const renderProps = {
    ...restProps,
    'ref': anchorRef,
    // An unresolvable target renders as a disabled anchor: no href, no
    // navigation, no prefetch — the tree keeps rendering.
    'href': resolved ? targetPath : undefined,
    'aria-disabled': (resolved ? undefined : true) as true | undefined,
    'className': resultClassName || undefined,
    'style': normalizedStyle,
    'onClick': onClick,
    'onMouseEnter': onMouseEnter,
    'onMouseLeave': onMouseLeave,
    'children': children,
    'aria-current': (isActive ? 'page' : undefined) as 'page' | undefined,
    'aria-busy': (isPending || undefined) as boolean | undefined,
  };
  if (as) return as(renderProps as ElementProps<HTMLAnchorElement>, { isActive, isPending });
  return <a {...renderProps} />;
};
