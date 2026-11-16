/**
 * Regras dos documentos (sem banco): link seguro, quem vê, agrupamento
 * e validação do formulário.
 */
import { describe, expect, it } from "vitest";
import {
  agruparPorCategoria,
  descreverVisibilidade,
  linkSeguro,
  normalizarVisivelPara,
  podeVerDocumento,
  servicoDoLink,
} from "@/lib/documentos";
import { esquemaDocumento, esquemaEnvioArquivo, esquemaSituacaoDocumento } from "@/lib/validacao-documentos";
import {
  caminhoArquivoValido,
  descreverArquivo,
  nomeArquivoSeguro,
  pastaArquivosDocumentos,
  tipoArquivoAceito,
  TAMANHO_MAXIMO_ARQUIVO,
} from "@/lib/documentos";
import { lerArquivo, paraDocumento } from "@/server/dados/documentos";

describe("linkSeguro", () => {
  it("aceita links https comuns", () => {
    expect(linkSeguro("  https://drive.google.com/file/d/abc/view?usp=sharing ")).toBe(
      "https://drive.google.com/file/d/abc/view?usp=sharing",
    );
    expect(linkSeguro("https://www.dropbox.com/s/x/ata.pdf?dl=0")).not.toBeNull();
  });

  it("recusa o que não for https ou parecer perigoso", () => {
    for (const ruim of [
      "",
      "http://drive.google.com/x",
      "javascript:alert(1)",
      "data:text/html,oi",
      "ftp://exemplo.com/a",
      "drive.google.com/x",
      "https://usuario:senha@exemplo.com/a",
      "https://localhost/a",
      "https://192.168.0.1/a",
      "https://[::1]/a",
      `https://exemplo.com/${"a".repeat(2001)}`,
    ]) {
      expect(linkSeguro(ruim), ruim).toBeNull();
    }
  });
});

describe("servicoDoLink", () => {
  it("reconhece os serviços mais usados", () => {
    expect(servicoDoLink("https://drive.google.com/file/d/1")).toBe("Google Drive");
    expect(servicoDoLink("https://docs.google.com/document/d/1")).toBe("Google Drive");
    expect(servicoDoLink("https://1drv.ms/b/abc")).toBe("OneDrive");
    expect(servicoDoLink("https://www.dropbox.com/s/a")).toBe("Dropbox");
  });

  it("não se engana com domínios parecidos", () => {
    expect(servicoDoLink("https://drive.google.com.golpe.com/x")).toBeNull();
    expect(servicoDoLink("https://falsodropbox.com/x")).toBeNull();
    expect(servicoDoLink("não é link")).toBeNull();
  });
});

describe("quem pode ver", () => {
  it("normaliza: sempre com admin, sem repetir, ignora lixo", () => {
    expect(normalizarVisivelPara(["conselheiro", "morador", "morador", "hacker", 3])).toEqual(["admin", "morador", "conselheiro"]);
    expect(normalizarVisivelPara(["admin"])).toEqual(["admin"]);
  });

  it("só mostra documento ativo e liberado para o papel", () => {
    const doc = { ativo: true, visivelPara: ["admin", "morador"] };
    expect(podeVerDocumento(doc, "morador")).toBe(true);
    expect(podeVerDocumento(doc, "portaria")).toBe(false);
    expect(podeVerDocumento({ ...doc, ativo: false }, "morador")).toBe(false);
  });

  it("descreve em texto simples", () => {
    expect(descreverVisibilidade(["admin"])).toBe("Só a administração");
    expect(descreverVisibilidade(["admin", "morador"])).toBe("Moradores");
    expect(descreverVisibilidade(["admin", "morador", "portaria", "conselheiro"])).toBe(
      "Moradores, Equipe da portaria e Conselho",
    );
  });
});

describe("agruparPorCategoria", () => {
  it("segue a ordem fixa das categorias e omite grupos vazios", () => {
    const grupos = agruparPorCategoria([
      { categoria: "outro" as const, titulo: "B" },
      { categoria: "regimento" as const, titulo: "A" },
      { categoria: "outro" as const, titulo: "C" },
    ]);
    expect(grupos.map((g) => g.categoria)).toEqual(["regimento", "outro"]);
    expect(grupos[1].itens).toHaveLength(2);
  });
});

describe("esquemaDocumento", () => {
  const base = {
    titulo: "Regimento interno",
    descricao: "",
    categoria: "regimento",
    url: "https://drive.google.com/file/d/abc/view",
    visivelPara: "morador",
    ativo: "sim",
  };

  it("aceita um cadastro válido (checkbox único vira lista; admin entra sozinho)", () => {
    const r = esquemaDocumento.parse(base);
    expect(r).toMatchObject({ id: null, categoria: "regimento", ativo: true, visivelPara: ["admin", "morador"] });
  });

  it("aceita vários públicos e o id na edição", () => {
    const r = esquemaDocumento.parse({ ...base, id: "doc_1", visivelPara: ["conselheiro", "portaria"], ativo: "nao" });
    expect(r).toMatchObject({ id: "doc_1", ativo: false, visivelPara: ["admin", "portaria", "conselheiro"] });
  });

  it("recusa link sem https, sem público, categoria inventada e id com barra", () => {
    expect(esquemaDocumento.safeParse({ ...base, url: "http://drive.google.com/x" }).success).toBe(false);
    expect(esquemaDocumento.safeParse({ ...base, url: "javascript:alert(1)" }).success).toBe(false);
    expect(esquemaDocumento.safeParse({ ...base, visivelPara: undefined }).success).toBe(false);
    expect(esquemaDocumento.safeParse({ ...base, visivelPara: "admin" }).success).toBe(false);
    expect(esquemaDocumento.safeParse({ ...base, categoria: "segredo" }).success).toBe(false);
    expect(esquemaDocumento.safeParse({ ...base, id: "../x" }).success).toBe(false);
    expect(esquemaDocumento.safeParse({ ...base, titulo: "ab" }).success).toBe(false);
  });

  it("situação: só sim/não e id válido", () => {
    expect(esquemaSituacaoDocumento.parse({ id: "abc", ativo: "nao" })).toEqual({ id: "abc", ativo: false });
    expect(esquemaSituacaoDocumento.safeParse({ id: "abc", ativo: "talvez" }).success).toBe(false);
  });
});

describe("arquivo enviado ao portal", () => {
  it("nome seguro: sem acentos, barras nem espaços, com a extensão", () => {
    expect(nomeArquivoSeguro("Ata de Março/2026.PDF")).toBe("Ata-de-Marco-2026.pdf");
    expect(nomeArquivoSeguro("../../segredo.pdf")).toBe("segredo.pdf");
    expect(nomeArquivoSeguro("   .pdf")).toBe("documento.pdf");
    expect(nomeArquivoSeguro("regimento")).toBe("regimento");
    expect(nomeArquivoSeguro(`${"a".repeat(300)}.pdf`)).toHaveLength(84);
  });

  it("caminho só vale dentro da pasta do PRÓPRIO condomínio", () => {
    const ok = `${pastaArquivosDocumentos("condo-a")}0f1e2d3c-4b5a-6978-8a9b-0c1d2e3f4a5b/Ata.pdf`;
    expect(caminhoArquivoValido(ok, "condo-a")).toBe(true);
    expect(caminhoArquivoValido(ok, "condo-b")).toBe(false);
    for (const ruim of [
      "condominiums/condo-a/documents/Ata.pdf",
      "condominiums/condo-a/documents/0f1e2d3c-4b5a/../Ata.pdf",
      "condominiums/condo-a/documents/0f1e2d3c-4b5a/sub/Ata.pdf",
      "condominiums/condo-a/documents/0f1e2d3c-4b5a/.oculto",
      "condominiums/condo-a/units/0f1e2d3c-4b5a/Ata.pdf",
      "",
    ]) {
      expect(caminhoArquivoValido(ruim, "condo-a"), ruim).toBe(false);
    }
  });

  it("tipos aceitos e descrição para o morador", () => {
    expect(tipoArquivoAceito("application/pdf")).toBe(true);
    expect(tipoArquivoAceito("image/jpeg")).toBe(true);
    expect(tipoArquivoAceito("text/html")).toBe(false);
    expect(tipoArquivoAceito("application/x-msdownload")).toBe(false);
    expect(tipoArquivoAceito("toString")).toBe(false);
    expect(descreverArquivo({ tipo: "application/pdf", tamanho: 1_258_291 })).toBe("PDF · 1,2 MB");
    expect(descreverArquivo({ tipo: "image/png", tamanho: 300 })).toBe("Imagem · 1 KB");
  });

  it("pedido de envio: tipo, tamanho e arquivo vazio", () => {
    const base = { nome: "ata.pdf", tipo: "application/pdf", tamanho: 1000 };
    expect(esquemaEnvioArquivo.safeParse(base).success).toBe(true);
    expect(esquemaEnvioArquivo.safeParse({ ...base, tipo: "text/html" }).success).toBe(false);
    expect(esquemaEnvioArquivo.safeParse({ ...base, tamanho: 0 }).success).toBe(false);
    expect(esquemaEnvioArquivo.safeParse({ ...base, tamanho: TAMANHO_MAXIMO_ARQUIVO + 1 }).success).toBe(false);
  });

  it("formulário com arquivo: novo exige arquivo; edição sem arquivo novo mantém o atual", () => {
    const base = { titulo: "Regimento interno", categoria: "regimento", visivelPara: "morador", origem: "arquivo" };
    expect(esquemaDocumento.safeParse(base).success).toBe(false);
    const caminho = "condominiums/c/documents/0f1e2d3c-4b5a/Ata.pdf";
    expect(esquemaDocumento.parse({ ...base, arquivoCaminho: caminho, arquivoNome: "Ata ç.pdf" }).fonte).toEqual({
      origem: "arquivo",
      caminho,
      nome: "Ata-c.pdf",
    });
    expect(esquemaDocumento.parse({ ...base, id: "doc_1" }).fonte).toEqual({ origem: "arquivo", caminho: null, nome: "documento" });
    expect(esquemaDocumento.safeParse({ ...base, origem: "outra" }).success).toBe(false);
  });

  it("no banco: arquivo vira o endereço protegido do portal (nunca o caminho interno)", () => {
    const arquivo = { caminho: "condominiums/c/documents/x1234567/Ata.pdf", nome: "Ata.pdf", tipo: "application/pdf", tamanho: 2048 };
    const doc = paraDocumento("doc_1", { titulo: "Ata", categoria: "ata", arquivo, visivelPara: ["admin", "morador"] });
    expect(doc?.url).toBe("/api/documentos/doc_1/arquivo");
    expect(doc?.arquivo).toEqual({ tipo: "application/pdf", tamanho: 2048 });
    expect(JSON.stringify(doc)).not.toContain(arquivo.caminho);
    // Arquivo estragado e sem link: o documento nem aparece.
    expect(paraDocumento("x", { titulo: "?", arquivo: { caminho: "a", tipo: "text/html", tamanho: 1 } })).toBeNull();
    expect(lerArquivo({ caminho: "a", tipo: "application/pdf", tamanho: -1 })).toBeNull();
    // Link continua funcionando como antes.
    expect(paraDocumento("y", { titulo: "Link", url: "https://drive.google.com/x" })?.url).toBe("https://drive.google.com/x");
  });
});
