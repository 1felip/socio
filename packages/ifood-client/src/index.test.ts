import { describe, expect, it } from 'vitest';
import { packageName } from './index';

describe('@socio/ifood-client', () => {
  it('exports its package name', () => {
    expect(packageName).toBe('@socio/ifood-client');
  });
});
