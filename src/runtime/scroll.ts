import { WINDOW_KEYS } from './state';
import { isVerticalScroll } from './match';
import { scrollMap, snapshot } from './state';
import { routerConfig } from './config';
import type { RouteMatch, RouterLocation } from '../types';

export const captureScroll = (location: RouterLocation) => {
  const leaf = snapshot().matches.at(-1);
  const option = leaf?.route.options.scrollRestoration;
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
export const applyScrollRestoration = (matches: RouteMatch[], location: RouterLocation) => {
  const leaf = matches.at(-1);
  const option = leaf?.route.options.scrollRestoration;
  if (!option) return;
  const saved = scrollMap.get(`${location.pathname}${location.search}`);
  const behavior = leaf?.route.options.scrollRestorationBehavior ?? routerConfig.defaultScrollRestorationBehavior;
  if (saved) {
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
    return;
  }
  window.scrollTo({ left: 0, top: 0, behavior });
};
export const restoreScrollNow = () => applyScrollRestoration(snapshot().matches, snapshot().location);
