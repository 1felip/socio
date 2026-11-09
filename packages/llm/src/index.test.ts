import { describe, expect, it } from 'vitest';
import { packageName } from './index';

describe('@socio/llm', () => {
  it('exports its package name', () => {
    expect(packageName).toBe('@socio/llm');
  });
});
