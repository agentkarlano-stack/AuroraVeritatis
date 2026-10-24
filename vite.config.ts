import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { cloudflare } from '@cloudflare/vite-plugin';

export default defineConfig({
  plugins: [react(), tailwindcss(), cloudflare()],
  // The deployed commit, reported by /api/health so post-merge checks test the right deployment.
  define: { __BUILD_COMMIT__: JSON.stringify(process.env.WORKERS_CI_COMMIT_SHA || process.env.GITHUB_SHA || '') },
  build: {
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('lightweight-charts')) return 'charts';
          if (id.includes('@supabase')) return 'supabase';
          if (id.includes('d3-') || id.includes('topojson') || id.includes('world-atlas')) return 'geo';
          return undefined;
        },
      },
    },
  },
});
