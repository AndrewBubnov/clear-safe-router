import { WINDOW_KEYS } from './state';
import { isVerticalScroll } from './match';
import { scrollMap, snapshot } from './state';
import { routerConfig } from './config';
import type { RouteMatch, RouterLocation } from '../types';

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
  if (Array.isArray(option)) {
    for (const id of option) {
      const element = document.getElementById(id);
      if (!element) continue;
      entries.push([id, isVerticalScroll(element) ? element.scrollTop : element.scrollLeft]);
    }
  } else {
    const top = document.scrollingElement?.scrollTop ?? window.scrollY;
    const left = document.scrollingElement?.scrollLeft ?? window.scrollX;
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
  if (!saved) {
    // Automatic restores reset an unseen location to the top; the manual
    // `restoreScrollNow()` leaves the scroll position untouched instead.
    if (resetIfUnsaved) window.scrollTo({ left: 0, top: 0, behavior });
    return;
  }
  const windowArgs: ScrollToOptions = { behavior };
  for (const [key, position] of saved) {
    if (key === WINDOW_KEYS.top) windowArgs.top = position;
    else if (key === WINDOW_KEYS.left) windowArgs.left = position;
    else {
      const element = document.getElementById(key);
      if (!element) continue;
      element.scrollTo({ [isVerticalScroll(element) ? 'top' : 'left']: position, behavior } as ScrollToOptions);
    }
  }
  if (windowArgs.top !== undefined || windowArgs.left !== undefined) window.scrollTo(windowArgs);
};
export const restoreScrollNow = ({ resetIfUnsaved = false }: { resetIfUnsaved?: boolean } = {}) =>
  applyScrollRestoration(snapshot().matches, snapshot().location, { resetIfUnsaved });
