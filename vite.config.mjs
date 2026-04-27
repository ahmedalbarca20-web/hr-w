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
          throw new Error(
            '[Vercel Build] Set project Environment Variable VITE_API_BASE_URL to your deployed API '
            + 'root using HTTPS and ending with /api (example: https://hr-api.onrender.com/api). '
            + 'Relative /api or localhost URLs work only on your PC — visitors get 404 / ERR_CONNECTION_REFUSED. '
            + 'To skip this check (not recommended): SKIP_VERCEL_API_CHECK=1',
          );
        }
      },
    },
  ],
});
