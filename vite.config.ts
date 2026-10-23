import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// Relative base so the built app can be hosted on any static path.
export default defineConfig({
  plugins: [react()],
  base: './',
  test: {
    environment: 'node',
  },
});
