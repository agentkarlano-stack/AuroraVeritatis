import { defineConfig } from 'vitest/config';

// Kept separate from vite.config.ts so unit tests don't spin up the Cloudflare runtime.
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx', 'worker/**/*.test.ts', 'shared/**/*.test.ts', 'scripts/**/*.test.ts'],
    environment: 'node',
  },
});
