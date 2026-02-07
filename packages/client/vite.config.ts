import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import os from 'os';

function getLanAddress(): string {
  const nets = os.networkInterfaces();
  for (const iface of Object.values(nets)) {
    for (const info of iface ?? []) {
      if (info.family === 'IPv4' && !info.internal) {
        return info.address;
      }
    }
  }
  return 'localhost';
}

const base = process.env.GITHUB_PAGES ? '/BlitzTiles/' : '/';

export default defineConfig({
  base,
  plugins: [react()],
  define: {
    __DEV_LAN_IP__: JSON.stringify(getLanAddress()),
  },
  server: {
    port: 5173,
    host: true,
  },
  optimizeDeps: {
    include: ['@dnd-kit/utilities'],
  },
});
