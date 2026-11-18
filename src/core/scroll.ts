import { WINDOW_KEYS } from './state';
import { isVerticalScroll } from './match';
import { scrollMap, snapshot } from './state';
import { routerConfig } from './config';
import { getRouterEnv, type EnvScrollOptions } from './env';
import type { RouteMatch, RouterLocation } from './types';

/** The scroll option of a navigation: the deepest matched route that declares
 * `scrollRestoration` wins (an explicit `false` declares it too and mutes the
 * parent), so the option works on a layout/parent as well. */
const scrollOptionFor = (matches: RouteMatch[]) => {
  for (let i = matches.length - 1; i >= 0; i--) {
    const route = matches[i]!.route;
    if (route.options.scrollRestoration !== undefined) return route;
  }
  return undefined;
};

export const captureScroll = (location: RouterLocation) => {
  const route = scrollOptionFor(snapshot().matches);
  const option = route?.options.scrollRestoration;
  if (!option) return;
  const entries: [string, number][] = [];
  const env = getRouterEnv();
  if (Array.isArray(option)) {
    for (const id of option) {
      const element = env.elementById(id);
      if (!element) continue;
      const positions = env.elementScrollPos(element);
      entries.push([id, isVerticalScroll(element) ? positions.top : positions.left]);
    }
  } else {
    const { top, left } = env.scrollPos();
    if (top) entries.push([WINDOW_KEYS.top, top]);
    if (left) entries.push([WINDOW_KEYS.left, left]);
  }
  if (entries.length) scrollMap.set(`${location.pathname}${location.search}`, entries);
};
export const applyScrollRestoration = (matches: RouteMatch[], location: RouterLocation, { resetIfUnsaved = true }: { resetIfUnsaved?: boolean } = {}) => {
  const route = scrollOptionFor(matches);
  const option = route?.options.scrollRestoration;
  if (!option) return;
  const saved = scrollMap.get(`${location.pathname}${location.search}`);
  const behavior = route?.options.scrollRestorationBehavior ?? routerConfig.defaultScrollRestorationBehavior;
  const env = getRouterEnv();
  if (!saved) {
    // Automatic restores reset an unseen location to the top; the manual
    // `restoreScrollNow()` leaves the scroll position untouched instead.
    if (resetIfUnsaved) env.scrollTo({ left: 0, top: 0, behavior });
    return;
  }
  const windowArgs: EnvScrollOptions = { behavior };
  for (const [key, position] of saved) {
    if (key === WINDOW_KEYS.top) windowArgs.top = position;
    else if (key === WINDOW_KEYS.left) windowArgs.left = position;
    else {
      const element = env.elementById(key);
      if (!element) continue;
      env.scrollElementTo(element, { [isVerticalScroll(element) ? 'top' : 'left']: position, behavior });
    }
  }
  if (windowArgs.top !== undefined || windowArgs.left !== undefined) env.scrollTo(windowArgs);
};
export const restoreScrollNow = ({ resetIfUnsaved = false }: { resetIfUnsaved?: boolean } = {}) =>
  applyScrollRestoration(snapshot().matches, snapshot().location, { resetIfUnsaved });
