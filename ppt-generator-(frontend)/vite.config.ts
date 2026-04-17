import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, __dirname, '');
  const devPort = Number(env.VITE_PORT || 3000);
  const apiProxyTarget = env.VITE_API_PROXY_TARGET || 'http://127.0.0.1:8000';

  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      host: '0.0.0.0',
      port: devPort,
      proxy: {
        '/api': {
          target: apiProxyTarget,
          changeOrigin: true,
        },
      },
      hmr: process.env.DISABLE_HMR !== 'true',
    },
  };
});
