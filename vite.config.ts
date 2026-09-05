import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import 'dotenv/config';
export default defineConfig({
  plugins: [react()],
  server: {
    port: Number(process.env.CV_WEB_PORT || 5173),
    strictPort: true,
    proxy: { '/api': `http://127.0.0.1:${process.env.CV_API_PORT || 3001}` },
  },
});
