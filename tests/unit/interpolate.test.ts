import { describe, expect, it } from 'vitest';
import { interpolate, matchSegments } from '../../src/core/match';

describe('interpolate', () => {
  it('replaces named segments', () => {
    expect(interpolate('/users/$id', { id: '42' })).toBe('/users/42');
    expect(interpolate('/shop/$cat/$id', { cat: 'a', id: '1' })).toBe('/shop/a/1');
  });

  it('interpolates the catch-all segment from _splat, keeping slashes', () => {
    expect(interpolate('/$', { _splat: 'a/b' })).toBe('/a/b');
    expect(interpolate('/docs/$', { _splat: 'guide/intro' })).toBe('/docs/guide/intro');
  });

  it('still encodes ordinary characters of a splat value', () => {
    expect(interpolate('/$', { _splat: 'a b' })).toBe('/a%20b');
  });

  it('throws when a parameter is missing', () => {
    expect(() => interpolate('/users/$id', {})).toThrow('Missing route parameter "id"');
    expect(() => interpolate('/$', {})).toThrow('Missing route parameter "_splat"');
  });

  it('returns the path unchanged without params', () => {
    expect(interpolate('/about')).toBe('/about');
    expect(interpolate('/users/$id')).toBe('/users/$id');
  });

  it('treats a malformed %-encoded segment as unmatched instead of throwing', () => {
    expect(() => matchSegments('/a/:id', '/a/%', 'exact')).not.toThrow();
    expect(matchSegments('/a/:id', '/a/%', 'exact')).toBeNull();
    expect(() => matchSegments('/docs/*', '/docs/%zz', 'wildcard')).not.toThrow();
    expect(matchSegments('/docs/*', '/docs/%zz', 'wildcard')).toBeNull();
    expect(matchSegments('/a/:id', '/a/%2Fb', 'exact')).toEqual({ id: '/b' });
  });
});
