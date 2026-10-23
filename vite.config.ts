import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { cloudflare } from '@cloudflare/vite-plugin';

export default defineConfig({
  plugins: [react(), tailwindcss(), cloudflare()],
  // Identifies the deployed build (used as a cache key by the Worker's integration check).
  define: { __BUILD_ID__: JSON.stringify(process.env.GITHUB_SHA?.slice(0, 12) ?? process.env.WORKERS_CI_COMMIT_SHA?.slice(0, 12) ?? `local-${Date.now().toString(36)}`) },
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
