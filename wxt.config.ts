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
    version: '0.7.0',
    permissions: ['storage', 'activeTab', 'clipboardRead', 'notifications', 'alarms', 'offscreen'],
    host_permissions: [
      'https://og-proxy-production.up.railway.app/*',
      'https://sepolia.base.org/*',
      'https://web.telegram.org/*',
      'https://x.com/*',
      'https://twitter.com/*',
      'https://api.groq.com/*',
      'https://api.memchat.io/*',
    ],
    commands: {
      'voice-input': {
        description: 'Voice input (global, set at chrome://extensions/shortcuts)',
        global: true,
      },
    },
    web_accessible_resources: [
      {
        resources: ['tesseract/*'],
        matches: ['<all_urls>'],
      },
    ],
    content_security_policy: {
      extension_pages: "script-src 'self' 'wasm-unsafe-eval'; object-src 'self'",
    },
  },
});
