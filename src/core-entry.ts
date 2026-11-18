/**
 * Thin build entry for the `./core` subpath. The real kernel lives in
 * `./core` (and is emitted as the shared `core.js` chunk that `index.js`
 * imports too) — the entry exists only so Rollup can treat the kernel as a
 * manual chunk with a stable name instead of a content-hashed fragment.
 */
export * from './core';
