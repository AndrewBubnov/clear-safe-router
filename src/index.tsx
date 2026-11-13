import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { LinkProps, RouterProps } from './types';
import { RouteMatchRoot, RouteOutlet } from './route-api';
import { handlePopState, processBlockedTarget, resetBlockedTarget, resolveTarget, routerRuntime, setBlocker, setRouterConfig, submitRouteAction, useRouterSnapshot } from './runtime';

export type { FileRouteOptions, LinkProps, NavigateTarget, ParamsFor, Retry, RouteId, RouteNode, RouteStatus, RouterLocation, RouterProps, RouterRuntime, SearchParams, TypedDestination } from './types';
export type Location = import('./types').RouterLocation;
export { createFileRoute, Outlet } from './route-api';
export { routerRuntime };

export const Router = ({ routes, notFound = <p>Not found</p>, pendingFallback, errorFallback, maxCacheSize }: RouterProps) => {
  const state = useRouterSnapshot();
  setRouterConfig(routes, maxCacheSize);
  useEffect(() => {
    const onPopState = () => { void handlePopState(); };
    window.addEventListener('popstate', onPopState);
    void routerRuntime.navigate(`${window.location.pathname}${window.location.search}`);
    return () => window.removeEventListener('popstate', onPopState);
  }, [routes, maxCacheSize]);
  if (state.matches.length === 0) {
    if (state.status === 'idle' || state.status === 'pending') return <>{pendingFallback ?? null}</>;
    if (state.status === 'error' && errorFallback) {
      const error = state.errors.values().next().value;
      if (error) {
        const ErrorView = errorFallback;
        return <ErrorView error={error} />;
      }
    }
    return <>{notFound}</>;
  }
  const leaf = state.matches[state.matches.length - 1];
  if (state.matches.length === 1 && leaf?.route.id === '__root__' && state.status === 'active') return <>{notFound}</>;
  return <RouteMatchRoot defaults={{ pendingFallback, errorFallback }}><RouteOutlet index={0} /></RouteMatchRoot>;
};

export const Link = (props: LinkProps) => {
  const { to, toRaw, params, search, state, replace, children, className, prefetch = 'hover', ...anchorProps } = props as LinkProps & { to?: string; toRaw?: string; params?: Record<string, string | number>; search?: string | Record<string, string | number | boolean | null | undefined>; state?: unknown; replace?: boolean; children?: ReactNode; className?: string; prefetch?: 'hover' | 'render' | 'viewport' | 'none' };
  const resolved = resolveTarget({ to: to as string | undefined, toRaw, params, search, state });
  const anchorRef = useRef<HTMLAnchorElement>(null);
  const href = `${resolved.pathname}${resolved.search}`;
  useEffect(() => {
    if (prefetch === 'render') void routerRuntime.prefetch(href);
    if (prefetch !== 'viewport') return;
    const element = anchorRef.current;
    if (!element || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) { void routerRuntime.prefetch(href); observer.disconnect(); }
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [prefetch, href]);
  const onClick: React.MouseEventHandler<HTMLAnchorElement> = event => {
    anchorProps.onClick?.(event);
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    if (anchorProps.target && anchorProps.target !== '_self') return;
    if (anchorProps.download !== undefined) return;
    event.preventDefault();
    void routerRuntime.navigate({ toRaw: href, state, replace });
  };
  const onMouseEnter = (event: React.MouseEvent<HTMLAnchorElement>) => {
    anchorProps.onMouseEnter?.(event);
    if (prefetch === 'hover') void routerRuntime.prefetch(href);
  };
  return <a {...anchorProps} ref={anchorRef} href={href} className={className} onClick={onClick} onMouseEnter={onMouseEnter}>{children}</a>;
};

export const useNavigate = () => routerRuntime.navigate;
export const useLocation = () => useRouterSnapshot().location;
export const useRouteStatus = () => useRouterSnapshot().status;
export const useBlocker = (fn: (args: { current: ReturnType<typeof useLocation>; next: ReturnType<typeof useLocation> }) => boolean) => {
  const [blocked, setBlocked] = useState(false);
  useEffect(() => {
    setBlocker(args => { const result = fn(args); setBlocked(result); return result; });
    return () => setBlocker(undefined);
  }, [fn]);
  return { blocked, proceed: processBlockedTarget, reset: () => { resetBlockedTarget(); setBlocked(false); } };
};
export const useInvalidate = () => routerRuntime.invalidate;
export const usePrefetch = () => routerRuntime.prefetch;
export const useAction = (name: string) => (data: Record<string, unknown> = {}) => submitRouteAction(name, data);
