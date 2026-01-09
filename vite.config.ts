import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // This base path matches your repository name 'cloud-billing'
  // It is essential for GitHub Pages to find the built JS/CSS files
  base: '/cloud-billing/',
  server: {
    port: 3000,
  },
});