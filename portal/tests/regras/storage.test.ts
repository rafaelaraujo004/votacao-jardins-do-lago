/**
 * Testes das regras do Storage (rodam no simulador: npm run test:emu).
 * Simulam o navegador tentando enviar ou ler arquivos de documentos.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, it } from "vitest";
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { getBytes, ref, uploadBytes, deleteObject } from "firebase/storage";

let env: RulesTestEnvironment;

const CAMINHO = "condominiums/condo-a/documents/0f1e2d3c-4b5a-6978/Ata.pdf";
const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]); // "%PDF-"

beforeAll(async () => {
  const [host, porta] = (process.env.FIREBASE_STORAGE_EMULATOR_HOST ?? "127.0.0.1:9199").split(":");
  env = await initializeTestEnvironment({
    projectId: "demo-jardins-regras",
    storage: {
      rules: readFileSync(path.resolve(import.meta.dirname, "../../storage.rules"), "utf8"),
      host,
      port: Number(porta),
    },
  });
});

afterAll(async () => {
  await env?.cleanup();
});

/** Síndico com a autorização de uso único para UM caminho. */
const sindicoCom = (caminho: string) => env.authenticatedContext("sindico", { envioDoc: caminho }).storage();

describe("envio de arquivo de documento", () => {
  it("cria o arquivo exato que foi autorizado (PDF pequeno)", async () => {
    await assertSucceeds(uploadBytes(ref(sindicoCom(CAMINHO), CAMINHO), PDF, { contentType: "application/pdf" }));
  });

  it("não cria em outro caminho, outro condomínio ou sem autorização", async () => {
    const outro = "condominiums/condo-a/documents/0f1e2d3c-4b5a-6978/Outro.pdf";
    await assertFails(uploadBytes(ref(sindicoCom(CAMINHO), outro), PDF, { contentType: "application/pdf" }));
    const vizinho = "condominiums/condo-b/documents/0f1e2d3c-4b5a-6978/Ata.pdf";
    await assertFails(uploadBytes(ref(sindicoCom(CAMINHO), vizinho), PDF, { contentType: "application/pdf" }));
    const semAutorizacao = env.authenticatedContext("morador1").storage();
    await assertFails(uploadBytes(ref(semAutorizacao, CAMINHO), PDF, { contentType: "application/pdf" }));
    await assertFails(uploadBytes(ref(env.unauthenticatedContext().storage(), CAMINHO), PDF, { contentType: "application/pdf" }));
  });

  it("recusa tipo perigoso, arquivo vazio e arquivo grande demais", async () => {
    const c = "condominiums/condo-a/documents/aaaa1111-bbbb/pagina.html";
    await assertFails(uploadBytes(ref(sindicoCom(c), c), PDF, { contentType: "text/html" }));
    const v = "condominiums/condo-a/documents/aaaa1111-cccc/vazio.pdf";
    await assertFails(uploadBytes(ref(sindicoCom(v), v), new Uint8Array(0), { contentType: "application/pdf" }));
    const g = "condominiums/condo-a/documents/aaaa1111-dddd/grande.pdf";
    await assertFails(uploadBytes(ref(sindicoCom(g), g), new Uint8Array(20 * 1024 * 1024 + 1), { contentType: "application/pdf" }));
  });

  it("ninguém lê, sobrescreve ou apaga pelo navegador (nem quem enviou)", async () => {
    const storage = sindicoCom(CAMINHO);
    await assertFails(getBytes(ref(storage, CAMINHO)));
    await assertFails(uploadBytes(ref(storage, CAMINHO), PDF, { contentType: "application/pdf" }));
    await assertFails(deleteObject(ref(storage, CAMINHO)));
    await assertFails(getBytes(ref(env.authenticatedContext("morador1").storage(), CAMINHO)));
  });
});
