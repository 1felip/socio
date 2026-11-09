import { defineProject } from 'vitest/config';

export default defineProject({
  test: { name: '@socio/llm', environment: 'node' },
});
