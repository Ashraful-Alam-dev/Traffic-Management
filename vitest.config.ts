import { defineConfig } from "vitest/config";
import fs from "node:fs";
import path from "node:path";

if (fs.existsSync(".env")) process.loadEnvFile(".env");

const testDb = process.env.DATABASE_URL_TEST ?? "";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, ".") } },
  test: {
    include: ["tests/**/*.test.ts"],
    globalSetup: ["tests/global-setup.ts"],
    fileParallelism: false,
    testTimeout: 20000,
    env: {
      DATABASE_URL: testDb,
      DIRECT_URL: testDb,
      JWT_SECRET: process.env.JWT_SECRET ?? "test-secret-test-secret-test-secret-123",
      CRON_SECRET: process.env.CRON_SECRET ?? "test-cron-secret",
      NODE_ENV: "test",
    },
  },
});
