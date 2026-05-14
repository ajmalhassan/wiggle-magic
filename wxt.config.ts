import { defineConfig } from 'wxt';

export default defineConfig({
  manifest: {
    name: 'Wiggle Magic',
    description:
      'Wiggle your cursor on any page to ask AI about what you see. Powered by Gemini Nano (on-device) with optional BYOK fallback.',
    permissions: ['storage', 'activeTab'],
    host_permissions: ['<all_urls>'],
    minimum_chrome_version: '138',
    action: {
      default_title: 'Wiggle Magic — saved answers',
    },
    web_accessible_resources: [
      { resources: ['cursor.svg'], matches: ['<all_urls>'] },
    ],
  },
  srcDir: '.',
  outDir: '.output',
});
