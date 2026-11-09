import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    outDir: '../custom_components/openhasp_builder/frontend',
    emptyOutDir: true,
    lib: {
      entry: 'src/panel.ts',
      formats: ['es'],
      fileName: () => 'openhasp-builder-panel.js',
    },
  },
});
