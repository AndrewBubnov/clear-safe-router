import { useEffect, useState, type SubmitEvent } from 'react';
import type { CacheSnapshot, RouteStatus as RouterStatus } from './types';
import {
  processBlockedTarget, resetBlockedTarget, restoreScrollNow, routerRuntime, setBlockerStatus, submitRouteAction,
  updateSearchParams, useBlockedTargetValue, useBlockerStateValue, useCacheSnapshotValue, useLoaderStateValue,
  useRouterContext, useRouterSnapshot,
} from './runtime';

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
  const onSubmit = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const result = await submit(Object.fromEntries(new FormData(form).entries()));
    if (!result.error && options.autoReset !== false) form.reset();
  };
  return { submit, onSubmit, data, error, isSubmitting };
};
