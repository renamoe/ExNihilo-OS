import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: {
    outDir: 'dist',
  },
  server: {
    proxy: {
      '/magpie': {
        target: 'http://127.0.0.1:3425',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/magpie/, ''),
      },
    },
  },
});
