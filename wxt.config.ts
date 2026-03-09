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
    version: '0.4.0',
    permissions: ['storage', 'activeTab', 'clipboardRead', 'alarms', 'notifications'],
    host_permissions: [
      'http://localhost:8402/*',
      'https://sepolia.base.org/*',
      'https://web.telegram.org/*',
    ],
  },
});
