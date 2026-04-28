import path from 'path';
import { fileURLToPath } from 'url';
import frontendConfig from './frontend/vite.config.js';
import { mergeConfig } from 'vite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Repo-root config so Vercel (cwd = monorepo root) builds the Vite app in /frontend. */
export default mergeConfig(frontendConfig, {
  root: path.resolve(__dirname, 'frontend'),
  plugins: [
    {
      name: 'enforce-public-api-base-on-vercel',
      configResolved() {
        if (process.env.VERCEL !== '1') return;
        if (process.env.SKIP_VERCEL_API_CHECK === '1') return;
        const base = String(process.env.VITE_API_BASE_URL || '').trim();
        const bad =
          !base
          || base.startsWith('/')
          || /^(https?:\/\/)?(localhost|127\.0\.0\.1)(:|\/|$)/i.test(base);
        if (bad) {
          // eslint-disable-next-line no-console
          console.warn(
            '[Vercel Build] VITE_API_BASE_URL is missing/invalid. Build will continue, '
            + 'but API calls in production may fail with 404 until you set '
            + 'VITE_API_BASE_URL=https://<backend-domain>/api in Vercel project variables.',
          );
        }
      },
    },
  ],
});
