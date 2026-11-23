import { useLayoutEffect, useRef, useState, type SubmitEvent } from "react";
import {
  routerRuntime,
  processBlockedTarget,
  resetBlockedTarget,
  restoreScrollNow,
  setBlockerStatus,
  submitRouteAction,
  updateSearchParams,
  useBlockedTargetValue,
  useBlockerStateValue,
  useCacheSnapshotValue,
  useRouterContext,
  useRouterSnapshot,
} from "./runtime";
import { blockerStateStore, blockedTargetStore } from "./core/state";
import type { CacheSnapshot, RouteStatus as RouterStatus } from "./types";

export const useNavigate = () => routerRuntime.navigate;
export const useLocation = () => useRouterSnapshot().location;
export function useRouteStatus(
  predicate: (status: RouterStatus) => boolean,
): boolean;
export function useRouteStatus(): RouterStatus;
export function useRouteStatus(predicate?: (status: RouterStatus) => boolean) {
  const status = useRouterSnapshot().status;
  return predicate ? predicate(status) : status;
}
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
  ) => void) &
    ((update: (previous: URLSearchParams) => URLSearchParams) => void);
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
let blockerOwnerSeq = 0;
let blockerOwner = -1;

export const useBlocker = (
  blockerFn: (args: {
    location: ReturnType<typeof useLocation>;
    nextLocation: ReturnType<typeof useLocation> | null;
    context: Record<string, unknown>;
  }) => boolean,
) => {
  const state = useBlockerStateValue();
  const nextLocation = useBlockedTargetValue();
  const location = useLocation();
  const { context } = useRouterContext();
  // The blocker function runs in an effect (never during render) and the global
  // charged state is owned by the most recently mounted hook: when that hook
  // unmounts while charged, it releases the blocker so navigation is not stuck.
  const fnRef = useRef(blockerFn);
  fnRef.current = blockerFn;
  const armedRef = useRef<boolean | null>(null);
  const unmountedRef = useRef(false);
  // Declared before the decision effect so its layout cleanup runs first on unmount.
  // The setup reset matters for React StrictMode, whose simulated unmount/remount
  // would otherwise leave unmountedRef stuck at true in development.
  useLayoutEffect(() => {
    unmountedRef.current = false;
    return () => {
      unmountedRef.current = true;
    };
  }, []);
  // Runs after every commit so arbitrary closure state (form dirtiness, context…)
  // stays reactive, but never inside render. Ownership is fixed at MOUNT order,
  // not per-render: a deps-less effect would re-run on every commit of either
  // blocker and flip ownership to whichever hook rendered last (a re-render of
  // a non-owner would steal it, leaving the true owner unable to release).
  // The most recently mounted hook owns the global charged state; when it
  // unmounts while charged, it releases the blocker so navigation is not stuck.
  const ownerIdRef = useRef(-1);
  if (ownerIdRef.current === -1) ownerIdRef.current = ++blockerOwnerSeq;
  useLayoutEffect(() => {
    const ownerId = ownerIdRef.current;
    blockerOwner = ownerId;
    const shouldBlock = !!fnRef.current({ location, nextLocation, context });
    if (armedRef.current !== shouldBlock) {
      armedRef.current = shouldBlock;
      // A re-run triggered by the block itself (nextLocation set) must not
      // overwrite the 'blocked' status.
      if (blockerStateStore.getState() !== "blocked")
        setBlockerStatus(shouldBlock ? "charged" : "unblocked");
    }
    return () => {
      if (blockerOwner !== ownerId) return;
      blockerOwner = -1;
      if (!unmountedRef.current) return;
      armedRef.current = null;
      // Release both states: a hook that unmounts mid-block ('blocked') leaves
      // nobody able to proceed(), so the pending target is dropped too.
      const state = blockerStateStore.getState();
      if (state === "charged" || state === "blocked") {
        blockerStateStore.setState("unblocked");
        blockedTargetStore.setState(null);
      }
    };
  });
  const process = async () => {
    if (!nextLocation) return;
    setBlockerStatus("unblocked");
    await processBlockedTarget();
  };
  const reset = () => {
    setBlockerStatus("charged");
    resetBlockedTarget();
  };
  return {
    state,
    blocked: state === "blocked",
    proceed: process,
    process,
    reset,
  };
};
export const useInvalidate = () => routerRuntime.invalidate;
export const useSubmitAction = (
  name: string,
  options: {
    onSuccess?: (data: unknown) => void;
    onError?: (error: Error) => void;
    autoReset?: boolean;
  } = {},
) => {
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
      const normalized =
        submitError instanceof Error
          ? submitError
          : new Error(String(submitError));
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
    const result = await submit(
      Object.fromEntries(new FormData(form).entries()),
    );
    if (!result.error && options.autoReset !== false) form.reset();
  };
  return { submit, onSubmit, data, error, isSubmitting };
};
