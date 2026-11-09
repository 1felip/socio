import { defineProject } from 'vitest/config';

export default defineProject({
  test: { name: '@socio/ifood-client', environment: 'node' },
});
