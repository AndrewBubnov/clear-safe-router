// @vitest-environment node
// Fresh module graph: this file must not import anything that pulls the
// adapter barrel (which would wire browserEnv) before asserting the core's
// own default platform.
import { expect, it } from 'vitest';
import { getRouterEnv, nullEnv } from '../../src/core/env';

it('the bare core defaults to nullEnv — browser wiring is an adapter concern', () => {
  expect(getRouterEnv()).toBe(nullEnv);
});
