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
import { esquemaDocumento, esquemaSituacaoDocumento } from "@/lib/validacao-documentos";

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
