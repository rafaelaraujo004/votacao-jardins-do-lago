/**
 * Assinaturas digitais da ata da votação: conferência do NOME COMPLETO e da IMAGEM (PNG).
 * As mesmas funções rodam no navegador (habilitar o "Confirmar") e no servidor (antes de gravar).
 */
import { describe, expect, it } from "vitest";
import {
  IDS_VAGAS_ATA,
  MAX_APARELHO,
  MAX_IMAGEM_ASSINATURA,
  VAGAS_ATA,
  mensagemLinkAssinatura,
  nomeCompletoOk,
  papelDaVaga,
  resumoAparelho,
  vagaValida,
  validarImagemAssinatura,
  validarNomeCompleto,
} from "@/lib/assinaturas-ata";

// PNG de verdade, 4 × 2 pixels, tinta azul (gerado com zlib).
const BASE64 = "iVBORw0KGgoAAAANSUhEUgAAAAQAAAACCAYAAAB/qH1jAAAAEUlEQVR4nGOQt+r6j4wZ0AUA9HIPEfcIoVsAAAAASUVORK5CYII=";
const PNG = `data:image/png;base64,${BASE64}`;

/** O mesmo PNG com outra largura/altura no cabeçalho (IHDR). */
function comTamanho(largura: number, altura: number): string {
  const b = Buffer.from(BASE64, "base64");
  b.writeUInt32BE(largura, 16);
  b.writeUInt32BE(altura, 20);
  return `data:image/png;base64,${b.toString("base64")}`;
}

describe("vagas da ata", () => {
  it("são 4, fixas, na ordem da ata", () => {
    expect(VAGAS_ATA.map((v) => [v.id, v.papel])).toEqual([
      ["comissao-1", "Comissão eleitoral"],
      ["comissao-2", "Comissão eleitoral"],
      ["sindico", "Síndico(a)"],
      ["testemunha", "Testemunha"],
    ]);
    expect(IDS_VAGAS_ATA).toEqual(["comissao-1", "comissao-2", "sindico", "testemunha"]);
  });

  it("só aceita as vagas conhecidas", () => {
    expect(vagaValida("sindico")).toBe(true);
    expect(vagaValida("testemunha")).toBe(true);
    expect(vagaValida("presidente")).toBe(false);
    expect(vagaValida("../sindico")).toBe(false);
    expect(vagaValida(3)).toBe(false);
    expect(papelDaVaga("comissao-2")).toBe("Comissão eleitoral");
  });
});

describe("validarNomeCompleto", () => {
  it("aceita nome e sobrenome e arruma os espaços", () => {
    expect(validarNomeCompleto("  José   da  Silva ")).toEqual({ ok: true, nome: "José da Silva" });
    expect(validarNomeCompleto("Ana-Clara D'Ávila")).toEqual({ ok: true, nome: "Ana-Clara D'Ávila" });
    expect(validarNomeCompleto("Maria S.")).toEqual({ ok: true, nome: "Maria S." });
    expect(nomeCompletoOk("Raimunda Nonata")).toBe(true);
  });

  it("recusa nome sem sobrenome, vazio ou com números/símbolos", () => {
    expect(validarNomeCompleto("José")).toMatchObject({ ok: false, erro: expect.stringMatching(/sobrenome/) });
    expect(validarNomeCompleto("José -")).toMatchObject({ ok: false });
    expect(validarNomeCompleto("   ")).toMatchObject({ ok: false, erro: expect.stringMatching(/nome completo/) });
    expect(validarNomeCompleto(undefined)).toMatchObject({ ok: false });
    expect(validarNomeCompleto("Casa 12 Silva")).toMatchObject({ ok: false, erro: expect.stringMatching(/só letras/) });
    expect(validarNomeCompleto("José <b>Silva</b>")).toMatchObject({ ok: false });
    expect(nomeCompletoOk("José")).toBe(false);
  });

  it("até 80 caracteres", () => {
    const ok = `Maria ${"a".repeat(74)}`;
    expect(ok).toHaveLength(80);
    expect(validarNomeCompleto(ok).ok).toBe(true);
    expect(validarNomeCompleto(`${ok}b`)).toMatchObject({ ok: false, erro: expect.stringMatching(/80/) });
  });
});

describe("validarImagemAssinatura", () => {
  it("aceita um PNG de verdade e lê o tamanho", () => {
    expect(validarImagemAssinatura(PNG)).toEqual({ ok: true, imagem: PNG, largura: 4, altura: 2 });
    expect(validarImagemAssinatura(comTamanho(600, 180))).toMatchObject({ ok: true, largura: 600, altura: 180 });
  });

  it("recusa vazio, outro formato e base64 estranho", () => {
    expect(validarImagemAssinatura("")).toMatchObject({ ok: false, erro: expect.stringMatching(/Passe o dedo/) });
    expect(validarImagemAssinatura(null)).toMatchObject({ ok: false });
    expect(validarImagemAssinatura(`data:image/jpeg;base64,${BASE64}`)).toMatchObject({ ok: false });
    expect(validarImagemAssinatura(`data:image/png;base64,${BASE64.slice(0, -4)}<script>`)).toMatchObject({ ok: false });
    expect(validarImagemAssinatura(`data:image/png;base64,${BASE64}A`)).toMatchObject({ ok: false });
    expect(validarImagemAssinatura("data:image/png;base64,iVBORw0K")).toMatchObject({ ok: false });
  });

  it("recusa o que diz ser PNG mas não é", () => {
    const texto = Buffer.from("isto não é uma imagem, só um texto comprido o bastante para passar do mínimo").toString("base64");
    expect(validarImagemAssinatura(`data:image/png;base64,${texto}`)).toMatchObject({ ok: false });
    // Assinatura do PNG certa, mas sem o cabeçalho IHDR.
    const b = Buffer.from(BASE64, "base64");
    b.write("XXXX", 12, "ascii");
    expect(validarImagemAssinatura(`data:image/png;base64,${b.toString("base64")}`)).toMatchObject({ ok: false });
  });

  it("recusa largura acima de 600 px, tamanho zero e texto grande demais", () => {
    expect(validarImagemAssinatura(comTamanho(601, 180))).toMatchObject({ ok: false });
    expect(validarImagemAssinatura(comTamanho(600, 601))).toMatchObject({ ok: false });
    expect(validarImagemAssinatura(comTamanho(0, 10))).toMatchObject({ ok: false });
    const enorme = `${PNG.slice(0, -4)}${"A".repeat(MAX_IMAGEM_ASSINATURA)}`;
    expect(validarImagemAssinatura(enorme)).toMatchObject({ ok: false, erro: expect.stringMatching(/grande demais/) });
  });
});

describe("apoio", () => {
  it("resumoAparelho corta em 160, tira caracteres de controle e nunca fica vazio", () => {
    expect(resumoAparelho(`Mozilla/5.0 ${"x".repeat(300)}`)).toHaveLength(MAX_APARELHO);
    expect(resumoAparelho("Android\n\u0007 Chrome")).toBe("Android Chrome");
    expect(resumoAparelho(null)).toBe("desconhecido");
    expect(resumoAparelho("   ")).toBe("desconhecido");
  });

  it("mensagem do WhatsApp com título, papel e link", () => {
    expect(mensagemLinkAssinatura("Eleição do síndico 2026", "Testemunha", "https://x.app/assinar-ata/ABCDEFGHJK")).toBe(
      "Olá! Assine a ata da votação Eleição do síndico 2026 (Testemunha) pelo link: https://x.app/assinar-ata/ABCDEFGHJK — o link vale uma vez.",
    );
  });
});
