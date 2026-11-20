import { describe, expect, it } from "vitest";
import {
  caminhoComprovanteValido,
  comprovantesParaTela,
  descreverComprovante,
  esquemaAnexarComprovante,
  esquemaEnvioComprovante,
  lerComprovantes,
  pastaComprovantes,
  tipoComprovanteAceito,
} from "@/lib/comprovantes";

describe("caminho do comprovante no Storage", () => {
  const pasta = pastaComprovantes("jardins-do-lago");

  it("aceita só a pasta finance do próprio condomínio, no formato {envio}/{nome}", () => {
    expect(caminhoComprovanteValido(`${pasta}0b5c9a3e-1111-4c1d-9e0f-123456789abc/nota.pdf`, "jardins-do-lago")).toBe(true);
    expect(caminhoComprovanteValido(`${pasta}0b5c9a3e-1111-4c1d-9e0f-123456789abc/nota.pdf`, "outro-condominio")).toBe(false);
    expect(caminhoComprovanteValido("condominiums/jardins-do-lago/documents/0b5c9a3e-1111/nota.pdf", "jardins-do-lago")).toBe(false);
  });

  it("recusa caminhos tortos", () => {
    expect(caminhoComprovanteValido(`${pasta}../nota.pdf`, "jardins-do-lago")).toBe(false);
    expect(caminhoComprovanteValido(`${pasta}0b5c9a3e-1111/sub/nota.pdf`, "jardins-do-lago")).toBe(false);
    expect(caminhoComprovanteValido(`${pasta}0b5c9a3e-1111/nota com espaço.pdf`, "jardins-do-lago")).toBe(false);
  });
});

describe("lista de comprovantes gravada no lançamento", () => {
  const bom = { id: "7f1c2d3e-aaaa-bbbb", caminho: "condominiums/x/finance/abc12345/nota.pdf", nome: "nota.pdf", tipo: "application/pdf", tamanho: 1234, enviadoEm: 1, enviadoPor: "u" };

  it("lê os válidos e descarta o resto", () => {
    expect(lerComprovantes([bom, null, { ...bom, id: "../x" }, { ...bom, tamanho: 0 }, "texto"])).toEqual([
      { id: bom.id, caminho: bom.caminho, nome: "nota.pdf", tipo: "application/pdf", tamanho: 1234 },
    ]);
    expect(lerComprovantes(undefined)).toEqual([]);
  });

  it("para a tela, sem o caminho no Storage", () => {
    expect(comprovantesParaTela([bom])).toEqual([{ id: bom.id, nome: "nota.pdf", tipo: "application/pdf", tamanho: 1234 }]);
  });
});

describe("envio do comprovante", () => {
  it("aceita PDF e foto; recusa o resto e acima de 20 MB", () => {
    expect(tipoComprovanteAceito("application/pdf")).toBe(true);
    expect(tipoComprovanteAceito("image/jpeg")).toBe(true);
    expect(tipoComprovanteAceito("application/msword")).toBe(false);
    expect(esquemaEnvioComprovante.safeParse({ nome: "a.pdf", tipo: "application/pdf", tamanho: 21 * 1024 * 1024 }).success).toBe(false);
    expect(esquemaEnvioComprovante.safeParse({ nome: "a.pdf", tipo: "application/pdf", tamanho: 1000 }).success).toBe(true);
  });

  it("o nome do arquivo fica seguro (sem acento nem espaço)", () => {
    const r = esquemaAnexarComprovante.parse({ lancamentoId: "AbC123", caminho: "x", nome: "Recibo da Gasolina.pdf" });
    expect(r.nome).toMatch(/^[A-Za-z0-9._-]+$/);
    expect(r.nome.endsWith(".pdf")).toBe(true);
    expect(esquemaAnexarComprovante.safeParse({ lancamentoId: "../x", caminho: "x", nome: "a.pdf" }).success).toBe(false);
  });

  it("descreve tipo e tamanho", () => {
    expect(descreverComprovante({ tipo: "application/pdf", tamanho: 300 * 1024 })).toBe("PDF · 300 KB");
    expect(descreverComprovante({ tipo: "image/jpeg", tamanho: 2.5 * 1024 * 1024 })).toBe("Foto · 2,5 MB");
  });
});
