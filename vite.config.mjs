import path from 'path';
import { fileURLToPath } from 'url';
import frontendConfig from './frontend/vite.config.js';
import { mergeConfig } from 'vite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Repo-root config so Vercel (cwd = monorepo root) builds the Vite app in /frontend. */
export default mergeConfig(frontendConfig, {
  root: path.resolve(__dirname, 'frontend'),
});
