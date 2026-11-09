import { defineProject } from 'vitest/config';

export default defineProject({
  test: { name: '@socio/agents', environment: 'node' },
});
