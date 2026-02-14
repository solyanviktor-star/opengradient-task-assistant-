import { defineConfig } from 'wxt';
import tailwindcss from '@tailwindcss/vite';

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  vite: () => ({
    plugins: [tailwindcss()],
  }),
  manifest: {
    name: 'OpenGradient Task Assistant',
    description: 'AI-powered task extraction with TEE-verified privacy',
    version: '0.1.0',
    permissions: ['storage', 'activeTab'],
    host_permissions: [
      'https://llmogevm.opengradient.ai/*',
      'https://rpc.opengradient.ai/*',
    ],
  },
});
