import { describe, expect, it } from 'vitest';
import { packageName } from './index';

describe('@socio/db', () => {
  it('exports its package name', () => {
    expect(packageName).toBe('@socio/db');
  });
});
