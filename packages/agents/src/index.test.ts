import { describe, expect, it } from 'vitest';
import { packageName } from './index.ts';

describe('@socio/agents', () => {
  it('exports its package name', () => {
    expect(packageName).toBe('@socio/agents');
  });
});
