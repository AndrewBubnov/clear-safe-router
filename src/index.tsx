import { useEffect, useRef, useState, type CSSProperties, type FormEvent, type MouseEventHandler, type ReactElement, type ReactNode, type MouseEvent } from 'react';
import type { CacheSnapshot, DefaultPrefetch, LinkProps, LinkState, RouteStatus as RouterStatus, RouterProps } from './types';
import { RouteMatchRoot, RouteOutlet } from './route';
import { configureRouter, handlePopState, mergeContext, processBlockedTarget, resetBlockedTarget, resolveTarget, routerConfig, routerRuntime, setBlockerStatus, setRouterConfig, setupRevalidation, submitRouteAction, syncCacheSnapshot, updateSearchParams, restoreScrollNow, useBlockedTargetValue, useBlockerStateValue, useCacheSnapshotValue, useLoaderStateValue, useRouterContext, useRouterSnapshot } from './runtime';

export type { CacheReason, CacheSnapshot, CacheSnapshotEntry, ElementProps, FileRouteOptions, LazyComponent, LinkProps, LinkState, InvalidateResult, NavigateTarget, ParamsFor, Retry, RouteId, RouteNode, RouteStatus, RouterLocation, RouterProps, RouterRuntime, SearchParams, TypedDestination, DefaultPrefetch } from './types';
export { createFileRoute, Outlet, lazy } from './route';
export { useRouterContext } from './runtime';
export { routerRuntime, syncCacheSnapshot };

const isMobile = () => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches && window.matchMedia('(max-width: 768px)').matches;

export const Router = ({
  routes,
  notFound = <p>Not found</p>,
  pendingFallback,
  errorFallback,
  maxCacheSize,
  isAnimated = false,
  animationDuration,
  defaultRetry,
  defaultStaleTime,
  defaultPrefetch = 'hover',
  defaultHoverPrefetchDelay = 150,
  defaultMinLoaderDuration = 0,
  errorBoundary: ErrorBoundary,
  defaultBeforeLoad,
  defaultAfterLoad,
  defaultScrollRestorationBehavior = 'auto',
  revalidateOnFocus = false,
  revalidateOnReconnect = false,
  context,
  enableCacheSnapshot = false,
}: RouterProps) => {
  const state = useRouterSnapshot();
  setRouterConfig(routes, maxCacheSize);
  configureRouter({
    isAnimated,
    animationDuration,
    defaultRetry,
    defaultStaleTime,
    defaultPrefetch,
    defaultHoverPrefetchDelay,
    defaultMinLoaderDuration,
    defaultBeforeLoad,
    defaultAfterLoad,
    defaultScrollRestorationBehavior,
    revalidateOnFocus,
    revalidateOnReconnect,
    enableCacheSnapshot,
  });
  useEffect(() => {
    if (context) mergeContext(context);
    const onPopState = () => { void handlePopState(); };
    window.addEventListener('popstate', onPopState);
    const stopRevalidation = setupRevalidation();
    void routerRuntime.navigate(`${window.location.pathname}${window.location.search}`);
    return () => {
      window.removeEventListener('popstate', onPopState);
      stopRevalidation();
    };
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
  const tree = <RouteMatchRoot defaults={{ pendingFallback, errorFallback }}><RouteOutlet index={0} /></RouteMatchRoot>;
  return ErrorBoundary ? <ErrorBoundary>{tree}</ErrorBoundary> : tree;
};

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
    as?: (props: import('./types').ElementProps<HTMLAnchorElement>, state: LinkState) => ReactElement;
    onClick?: MouseEventHandler<HTMLAnchorElement>; onMouseEnter?: MouseEventHandler<HTMLAnchorElement>; onMouseLeave?: MouseEventHandler<HTMLAnchorElement>;
    target?: string; download?: unknown;
  };
  const className = classNameInput as string | ((state: LinkState) => string) | undefined;
  const style = styleInput as CSSProperties | ((state: LinkState) => CSSProperties) | undefined;
  const resolved = resolveTarget({ to: to as string | undefined, toRaw, params, search, state });
  const targetPath = `${resolved.pathname}${resolved.search}`;
  const anchorRef = useRef<HTMLAnchorElement>(null);
  const state_ = useRouterSnapshot();
  const currentPath = `${state_.location.pathname}${state_.location.search}`;
  const isActive = resolved.search === '' || resolved.search === undefined
    ? exact ? state_.location.pathname === resolved.pathname : resolved.pathname === '/'
      ? state_.location.pathname === '/'
      : state_.location.pathname === resolved.pathname || state_.location.pathname.startsWith(`${resolved.pathname}/`)
    : currentPath === targetPath;
  const isPending = currentPath === targetPath && state_.status === 'pending';
  const strategy: 'hover' | 'render' | 'viewport' | 'none' = linkPrefetch === 'auto' ? (isMobile() ? 'viewport' : 'hover') : linkPrefetch as 'hover' | 'render' | 'viewport' | 'none';
  useEffect(() => {
    if (strategy === 'render') void routerRuntime.prefetch(targetPath);
    if (strategy !== 'viewport') return;
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
        void routerRuntime.prefetch(targetPath).then(() => { if (!attempt.signal.aborted) observer.disconnect(); });
      }, 250);
    });
    observer.observe(element);
    return () => { window.clearTimeout(dwellTimer); controller?.abort(); observer.disconnect(); };
  }, [strategy, targetPath]);
  useEffect(() => {
    if (strategy !== 'hover') return;
    return () => { if (hoverTimeout.current) window.clearTimeout(hoverTimeout.current); };
  }, [strategy]);
  const hoverTimeout = useRef(0);
  const onClick: MouseEventHandler<HTMLAnchorElement> = async event => {
    onClickProp?.(event);
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    if (target && target !== '_self') return;
    if (download !== undefined) return;
    event.preventDefault();
    await beforeNavigate?.();
    void routerRuntime.navigate({ toRaw: targetPath, state, replace });
  };
  const onMouseEnter = (event: MouseEvent<HTMLAnchorElement>) => {
    onMouseEnterProp?.(event);
    if (strategy !== 'hover') return;
    const delay = hoverPrefetchDelay ?? routerConfig.defaultHoverPrefetchDelay;
    if (!delay) return;
    if (hoverTimeout.current) window.clearTimeout(hoverTimeout.current);
    hoverTimeout.current = window.setTimeout(() => { void routerRuntime.prefetch(targetPath); }, delay);
  };
  const onMouseLeave = (event: MouseEvent<HTMLAnchorElement>) => {
    onMouseLeaveProp?.(event);
    if (strategy !== 'hover') return;
    if (hoverTimeout.current) { window.clearTimeout(hoverTimeout.current); hoverTimeout.current = 0; }
  };
  const normalizedClassName = typeof className === 'function' ? className({ isActive, isPending }) : className;
  const normalizedStyle = typeof style === 'function' ? style({ isActive, isPending }) : style;
  const resultClassName = [isActive && activeClassName, isPending && pendingClassName, normalizedClassName].filter(Boolean).join(' ');
  const renderProps = {
    ...restProps,
    'ref': anchorRef,
    'href': targetPath,
    'className': resultClassName || undefined,
    'style': normalizedStyle,
    'onClick': onClick,
    'onMouseEnter': onMouseEnter,
    'onMouseLeave': onMouseLeave,
    'children': children,
    'aria-current': (isActive ? 'page' : undefined) as 'page' | undefined,
    'aria-busy': (isPending || undefined) as boolean | undefined,
  };
  if (as) return as(renderProps as import('./types').ElementProps<HTMLAnchorElement>, { isActive, isPending });
  return <a {...renderProps} />;
};

export const useNavigate = () => routerRuntime.navigate;
export const useLocation = () => useRouterSnapshot().location;
export function useRouteStatus(predicate: (status: RouterStatus) => boolean): boolean;
export function useRouteStatus(): RouterStatus;
export function useRouteStatus(predicate?: (status: RouterStatus) => boolean) {
  const status = useRouterSnapshot().status;
  return predicate ? predicate(status) : status;
}
export const useParams = <T = Record<string, string>>() => {
  const state = useRouterSnapshot();
  return (state.matches.at(-1)?.params ?? {}) as T;
};
export const useLoaderState = <T = unknown>() => useLoaderStateValue() as { data: T; loaderError: Error | null; beforeLoadError: Error | null };
export const useCacheSnapshot = () => useCacheSnapshotValue() as CacheSnapshot;
export const useSearchParams = () => {
  const state = useRouterSnapshot();
  const params = new URLSearchParams(state.location.search);
  const setSearchParams = ((
    keyOrUpdate: string | ((previous: URLSearchParams) => URLSearchParams),
    value?: string | string[] | null,
  ) => updateSearchParams(keyOrUpdate, value)) as ((
    key: string,
    value: string | string[] | null,
  ) => void) & ((update: (previous: URLSearchParams) => URLSearchParams) => void);
  return {
    searchParams: params,
    getSearchParams: (key: string): string | string[] | null => {
      const all = params.getAll(key);
      if (all.length === 0) return null;
      return all.length === 1 ? all[0]! : all;
    },
    setSearchParams,
  };
};
export const useRestoreScroll = () => restoreScrollNow;
export const useBlocker = (blockerFn: (args: { location: ReturnType<typeof useLocation>; nextLocation: ReturnType<typeof useLocation> | null; context: Record<string, unknown> }) => boolean) => {
  const state = useBlockerStateValue();
  const nextLocation = useBlockedTargetValue();
  const location = useLocation();
  const { context } = useRouterContext();
  const shouldBlock = blockerFn({ location, nextLocation, context });
  useEffect(() => setBlockerStatus(shouldBlock ? 'charged' : 'unblocked'), [shouldBlock]);
  const process = async () => {
    if (!nextLocation) return;
    setBlockerStatus('unblocked');
    await processBlockedTarget();
  };
  const reset = () => {
    setBlockerStatus('charged');
    resetBlockedTarget();
  };
  return { state, blocked: state === 'blocked', proceed: process, process, reset };
};
export const useInvalidate = () => routerRuntime.invalidate;
export const usePrefetch = () => routerRuntime.prefetch;
export const useAction = (name: string) => (data: Record<string, unknown> = {}) => submitRouteAction(name, data);
export const useSubmitAction = (name: string, options: { onSuccess?: (data: unknown) => void; onError?: (error: Error) => void; autoReset?: boolean } = {}) => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [data, setData] = useState<unknown>(undefined);
  const [error, setError] = useState<Error | null>(null);
  const submit = async (input: Record<string, unknown>) => {
    setIsSubmitting(true);
    setError(null);
    try {
      const result = await submitRouteAction(name, input);
      setData(result);
      options.onSuccess?.(result);
      return { data: result, error: null as Error | null };
    } catch (submitError) {
      const normalized = submitError instanceof Error ? submitError : new Error(String(submitError));
      setError(normalized);
      options.onError?.(normalized);
      return { data: null, error: normalized };
    } finally {
      setIsSubmitting(false);
    }
  };
  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const result = await submit(Object.fromEntries(new FormData(form).entries()));
    if (!result.error && options.autoReset !== false) form.reset();
  };
  return { submit, onSubmit, data, error, isSubmitting };
};
