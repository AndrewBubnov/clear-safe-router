import { createContext, type ComponentType, type ReactNode } from 'react';

export type RouterDefaults = { pendingFallback?: ReactNode; errorFallback?: ComponentType<{ error: Error }> };

/** Depth of the currently rendered match. `Outlet` reads it to render the next level. */
export const MatchIndex = createContext(0);
export const DefaultsContext = createContext<RouterDefaults>({});

export const RouteMatchRoot = ({ children, index = 0, defaults }: { children?: ReactNode; index?: number; defaults?: RouterDefaults }) => (
  <DefaultsContext.Provider value={defaults ?? {}}>
    <MatchIndex.Provider value={index}>{children}</MatchIndex.Provider>
  </DefaultsContext.Provider>
);
