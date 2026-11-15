/// <reference types="vitest/config" />
import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Absolute site origin for social-card URLs. Explicit SITE_URL wins; on
 * Vercel the production domain or the deployment URL is used; otherwise the
 * tags fall back to root-relative paths, which most crawlers still resolve.
 */
function siteUrl(env: Record<string, string>): string {
  if (env.SITE_URL) return env.SITE_URL.replace(/\/$/, '');
  if (env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${env.VERCEL_PROJECT_PRODUCTION_URL}`;
  if (env.VERCEL_URL) return `https://${env.VERCEL_URL}`;
  return '';
}

function siteUrlPlugin(url: string): Plugin {
  return {
    name: 'site-url',
    transformIndexHtml(html) {
      return html.replaceAll('%SITE_URL%', url);
    },
  };
}

export default defineConfig(({ mode }) => {
  // BASE_PATH lets the build live under a sub-path (GitHub Pages: "/repo-name/").
  const env = loadEnv(mode, '.', '');
  const base = env.BASE_PATH && env.BASE_PATH.length > 0 ? env.BASE_PATH : '/';

  return {
    base,
    plugins: [react(), siteUrlPlugin(siteUrl(env))],
    resolve: {
      alias: {
        // Root-relative: Vite resolves this against the project root.
        '@': '/src',
      },
    },
    build: {
      target: 'es2022',
      sourcemap: false,
      // The three.js chunk alone is ~700 kB minified (~180 kB gzipped); that is expected.
      chunkSizeWarningLimit: 800,
      rollupOptions: {
        output: {
          // Three.js changes rarely; keeping it in its own chunk lets browsers
          // cache it across game updates.
          manualChunks: { three: ['three'] },
        },
      },
    },
    test: {
      globals: true,
      environment: 'node',
      include: ['src/**/*.test.ts'],
    },
  };
});
