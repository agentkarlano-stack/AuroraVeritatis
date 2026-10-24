import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { cloudflare } from '@cloudflare/vite-plugin';

export default defineConfig({
  // remoteBindings: false keeps local dev and preview offline; Workers AI ("ai" binding) is then absent locally and the AI
  // gateway answers "not configured". Deployed Workers (previews, production) get the real binding.
  plugins: [react(), tailwindcss(), cloudflare({ remoteBindings: false })],
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
