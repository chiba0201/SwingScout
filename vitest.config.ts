import { defineConfig } from 'vitest/config';

// ロジック（src/lib, scripts）のユニットテスト用。UIテストは必要になったら jsdom 環境を追加する。
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
