/// <reference types="vitest" />
/* global process */
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

import { cloudflare } from "@cloudflare/vite-plugin";

// When building for Capacitor (iOS/Android), skip the Cloudflare Workers plugin
// so Vite produces a plain static SPA in dist/.
// Usage: CAP_BUILD=true vite build
const isCapacitorBuild = process.env.CAP_BUILD === 'true';

// Unique id for this build, baked into the bundle (via `define`) AND emitted to
// /version.json (via the plugin below). Long-running kiosks compare the two at
// idle to detect a new deploy and reload — see src/lib/appUpdate.js. Prefer the
// CI commit SHA (stable per deploy); fall back to a build timestamp so every
// build still gets a distinct id even outside CI.
const buildId =
  process.env.CF_PAGES_COMMIT_SHA ||
  process.env.WORKERS_CI_COMMIT_SHA ||
  process.env.GITHUB_SHA ||
  `local-${Date.now()}`;

// Writes /version.json into the client build output so the deployed site
// advertises its build id at a stable, cache-bustable URL.
function emitVersionJson() {
  return {
    name: 'safepass-emit-version-json',
    apply: 'build',
    generateBundle() {
      // Only the client bundle serves browser-facing static assets; skip the
      // Cloudflare worker environment's bundle if present.
      if (this.environment?.name && this.environment.name !== 'client') return;
      this.emitFile({
        type: 'asset',
        fileName: 'version.json',
        source: JSON.stringify({ buildId }),
      });
    },
  };
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  // Skip the Cloudflare plugin both for Capacitor builds AND for the test
  // runner — Vitest doesn't need (and can be confused by) the worker-side
  // wrangler integration.
  plugins: [react(), emitVersionJson(), ...(!isCapacitorBuild && mode !== 'test' ? [cloudflare()] : [])],

  // Bundle's own build id, compared against /version.json at runtime to decide
  // whether a newer deploy is live (src/lib/appUpdate.js).
  define: {
    __APP_BUILD_ID__: JSON.stringify(buildId),
  },

  // Strip console.debug and console.warn from production builds.
  // console.error is preserved for genuine runtime errors.
  esbuild: mode === 'production' ? {
    drop: ['debugger'],
    pure: ['console.debug', 'console.warn', 'console.log'],
  } : undefined,

  // Vitest configuration. Picked up automatically by `vitest run` /
  // `vitest --watch`. jsdom gives us a DOM for React component tests;
  // globals: true lets us write `test()` / `expect()` without imports
  // (matches the existing node --test ergonomics).
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.js'],
    include: ['src/**/*.{test,spec}.{js,jsx}'],
    css: false,
  },
}))
