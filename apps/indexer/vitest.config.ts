import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    passWithNoTests: true,
    env: {
      DATABASE_URL:
        process.env.SMOKE_DATABASE_URL ||
        "postgresql://postgres:postgres@localhost:55432/indexer_smoke",
    },
  },
});
