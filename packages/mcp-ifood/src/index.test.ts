import { describe, expect, it } from 'vitest';
import { packageName } from './index';

describe('@socio/mcp-ifood', () => {
  it('exports its package name', () => {
    expect(packageName).toBe('@socio/mcp-ifood');
  });
});
