import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// VITE_BASE يضبط مسار الجذر: '/' للاستضافة العادية، و'/اسم-المستودع/' لـ GitHub Pages
export default defineConfig({
  base: process.env.VITE_BASE || '/',
  plugins: [react()],
  server: {
    port: 3000,
    // أثناء التطوير: كل نداءات /api تُمرَّر لخادم Express (التخزين المشترك + وسيط فاتورة)
    proxy: { '/api': 'http://localhost:8787' }
  },
  build: { outDir: 'dist', chunkSizeWarningLimit: 1400 }
});
