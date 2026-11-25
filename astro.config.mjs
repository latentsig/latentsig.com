import { defineConfig } from 'astro/config';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';

// https://astro.build/config
export default defineConfig({
  site: 'https://latentsig.com',
  trailingSlash: 'ignore',
  markdown: {
    remarkPlugins: [remarkMath],
    rehypePlugins: [rehypeKatex],
  },
  vite: {
    build: {
      // The observer-gated Three.js scene is a separate lazy chunk (about 139 kB gzipped).
      // Set the warning ceiling above its minified size so Vite reports real bundle growth.
      chunkSizeWarningLimit: 600,
      rollupOptions: {
        output: {
          manualChunks(id) {
            const normalized = id.replace(/\\/g, '/');
            if (!normalized.includes('/node_modules/three/')) return;
            if (normalized.includes('/build/three.module.js') || normalized.includes('/build/three.core.js')) return 'three-core';
            if (normalized.includes('/addons/') || normalized.includes('/examples/jsm/')) return 'three-extras';
            if (normalized.includes('/src/renderers/')) return 'three-renderers';
            if (normalized.includes('/src/materials/')) return 'three-materials';
            if (normalized.includes('/src/geometries/')) return 'three-geometries';
            if (normalized.includes('/src/math/')) return 'three-math';
            if (normalized.includes('/src/core/')) return 'three-core';
            if (normalized.includes('/src/')) return 'three-misc';
          },
        },
      },
    },
  },
});
