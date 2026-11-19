/** Comprovante em PDF: arquivo válido, com acentos, sem o voto. */
import { describe, expect, it } from "vitest";
import { gerarPdf, pdfComprovante } from "@/lib/pdf-simples";

const texto = (b: Uint8Array) => Buffer.from(b).toString("latin1");

describe("pdf-simples", () => {
  it("gera um PDF válido (cabeçalho, xref e fim)", () => {
    const pdf = texto(gerarPdf({ titulo: "Teste", linhas: [{ texto: "Olá (mundo) \\ ação" }] }));
    expect(pdf.startsWith("%PDF-1.4")).toBe(true);
    expect(pdf.trimEnd().endsWith("%%EOF")).toBe(true);
    expect(pdf).toContain("/WinAnsiEncoding");
    expect(pdf).toContain("Ol\u00e1 \\(mundo\\) \\\\ a\u00e7\u00e3o");
    // A posição do xref aponta para "xref".
    const pos = Number(/startxref\n(\d+)/.exec(pdf)![1]);
    expect(pdf.slice(pos, pos + 4)).toBe("xref");
  });

  it("comprovante traz casa, eleição e código — e nunca o voto", () => {
    const pdf = texto(
      pdfComprovante({
        condominioNome: "Jardins do Lago",
        titulo: "Eleição do síndico e conselho 2026/2027",
        cargo: "Chapa única",
        casa: "Casa 12",
        quando: "19/11/2026 às 17:42",
        codigo: "K7M4PX9Q",
        geradoEm: "19/11/2026 às 17:43",
      }),
    );
    expect(pdf).toContain("Casa 12");
    expect(pdf).toContain("K7M4PX9Q");
    expect(pdf).toContain("Comprovante de vota\u00e7\u00e3o");
    expect(pdf).not.toMatch(/\((SIM|N\u00c3O)\)/);
  });
});
