import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: {
    target: 'es2020',
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        // 隠しページ: ねこ図鑑（ゲームからはリンクしない）
        zukan: fileURLToPath(new URL('./zukan.html', import.meta.url)),
      },
    },
  },
});
