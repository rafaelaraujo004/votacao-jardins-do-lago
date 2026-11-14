import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const ambienteDemo = {
  NEXT_PUBLIC_USE_EMULATORS: "true",
  FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9099",
  FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080",
};

function aplicar(env: Record<string, string | undefined>) {
  for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v as string);
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("login de demonstração", () => {
  it("existe só com o simulador e fora de produção", async () => {
    const { demoAtivo } = await import("@/server/demo");
    aplicar({ ...ambienteDemo, NODE_ENV: "development" });
    expect(demoAtivo()).toBe(true);
  });

  it("desliga em build de produção, mesmo com o simulador configurado", async () => {
    const { demoAtivo } = await import("@/server/demo");
    aplicar({ ...ambienteDemo, NODE_ENV: "production" });
    expect(demoAtivo()).toBe(false);
  });

  it("desliga quando o simulador não está configurado", async () => {
    const { demoAtivo } = await import("@/server/demo");
    aplicar({ ...ambienteDemo, NODE_ENV: "development", FIRESTORE_EMULATOR_HOST: "" });
    expect(demoAtivo()).toBe(false);
    aplicar({ ...ambienteDemo, NODE_ENV: "development", NEXT_PUBLIC_USE_EMULATORS: "false" });
    expect(demoAtivo()).toBe(false);
  });

  it("a rota responde 404 em produção", async () => {
    aplicar({ ...ambienteDemo, NODE_ENV: "production" });
    const { POST } = await import("@/app/api/demo/entrar/route");
    const req = new NextRequest("http://localhost:3000/api/demo/entrar", {
      method: "POST",
      headers: { origin: "http://localhost:3000", host: "localhost:3000" },
      body: JSON.stringify({ perfil: "admin" }),
    });
    const resposta = await POST(req);
    expect(resposta.status).toBe(404);
  });
});
