import path from "node:path";
import { defineConfig } from "vitest/config";

const alias = {
  "@": path.resolve(import.meta.dirname, "src"),
  // "server-only" bloqueia importação no navegador; nos testes ele vira um módulo vazio.
  "server-only": path.resolve(import.meta.dirname, "tests/apoio/vazio.ts"),
};

export default defineConfig({
  test: {
    projects: [
      {
        resolve: { alias },
        test: { name: "unit", include: ["tests/unit/**/*.test.ts"], environment: "node" },
      },
      {
        resolve: { alias },
        test: {
          name: "emulador",
          include: ["tests/regras/**/*.test.ts", "tests/integracao/**/*.test.ts"],
          environment: "node",
          testTimeout: 20000,
          hookTimeout: 30000,
          fileParallelism: false,
        },
      },
    ],
  },
});
