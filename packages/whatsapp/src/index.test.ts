import { describe, expect, it } from 'vitest';
import { packageName } from './index';

describe('@socio/whatsapp', () => {
  it('exports its package name', () => {
    expect(packageName).toBe('@socio/whatsapp');
  });
});
