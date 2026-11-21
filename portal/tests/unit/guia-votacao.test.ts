/**
 * Passo a passo da votação: as imagens e o PDF único precisam existir em public/ e contar a
 * mesma história (1 página do PDF por imagem). Se alguém trocar as imagens e esquecer de
 * refazer o PDF (ou de ajustar PDF_GUIA.paginas), este teste avisa antes de ir ao ar.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { IMAGENS_GUIA, PDF_GUIA } from "@/lib/guia-votacao";

const publico = (src: string) => join(process.cwd(), "public", ...src.split("/").filter(Boolean));

describe("passo a passo da votação", () => {
  it("as imagens existem em public/", () => {
    for (const img of IMAGENS_GUIA) expect(existsSync(publico(img.src)), img.src).toBe(true);
  });

  it("o PDF existe, é PDF e tem uma página por imagem", () => {
    expect(PDF_GUIA.src.startsWith("/guia-votacao/")).toBe(true);
    expect(PDF_GUIA.arquivo.endsWith(".pdf")).toBe(true);
    expect(PDF_GUIA.paginas).toBe(IMAGENS_GUIA.length);

    const caminho = publico(PDF_GUIA.src);
    expect(existsSync(caminho)).toBe(true);
    const conteudo = readFileSync(caminho).toString("latin1");
    expect(conteudo.startsWith("%PDF-")).toBe(true);
    // Cada página é um objeto "/Type /Page" (o "/Type /Pages" é a lista e não conta).
    expect(conteudo.match(/\/Type\s*\/Page(?!s)/g)?.length).toBe(PDF_GUIA.paginas);
  });
});
