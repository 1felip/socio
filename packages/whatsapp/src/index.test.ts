import { describe, expect, it } from 'vitest';
import { packageName } from './index.ts';

describe('@socio/whatsapp', () => {
  it('exports its package name', () => {
    expect(packageName).toBe('@socio/whatsapp');
  });
});
