/**
 * Regras dos comunicados (sem banco): ordem, "novo", limpeza do texto,
 * resumo, WhatsApp, mudanças de situação e validação dos formulários.
 */
import { describe, expect, it } from "vitest";
import {
  conferirMudanca,
  destaquesDoInicio,
  ehNovo,
  limparTexto,
  limparTitulo,
  linkCompartilharWhatsApp,
  linkDoComunicado,
  mensagemWhatsApp,
  ordenarParaMorador,
  paragrafos,
  resumir,
  statusDepois,
  type Prioridade,
} from "@/lib/comunicados";
import { esquemaComunicado, esquemaMudanca } from "@/lib/validacao-comunicados";

const DIA = 24 * 60 * 60 * 1000;
const agora = new Date("2026-11-14T15:00:00Z");
const diasAtras = (n: number) => new Date(agora.getTime() - n * DIA);

type Item = { id: string; fixado: boolean; prioridade: Prioridade; publicadoEm: Date | null };
const item = (id: string, dias: number, extra: Partial<Item> = {}): Item => ({
  id,
  fixado: false,
  prioridade: "normal",
  publicadoEm: diasAtras(dias),
  ...extra,
});

describe("ehNovo", () => {
  it("marca como novo até 7 dias", () => {
    expect(ehNovo(diasAtras(0), agora)).toBe(true);
    expect(ehNovo(diasAtras(6.9), agora)).toBe(true);
    expect(ehNovo(diasAtras(7), agora)).toBe(false);
    expect(ehNovo(diasAtras(30), agora)).toBe(false);
  });
  it("sem data de publicação não é novo", () => {
    expect(ehNovo(null, agora)).toBe(false);
  });
  it("data muito no futuro (erro de relógio) não é novo", () => {
    expect(ehNovo(new Date(agora.getTime() + DIA), agora)).toBe(false);
  });
});

describe("ordenarParaMorador", () => {
  it("fixados primeiro, depois urgentes, depois os mais recentes", () => {
    const lista = [
      item("antigo", 20),
      item("recente", 1),
      item("urgente-velho", 15, { prioridade: "urgente" }),
      item("fixado-velho", 40, { fixado: true }),
      item("fixado-urgente", 50, { fixado: true, prioridade: "urgente" }),
    ];
    expect(ordenarParaMorador(lista).map((c) => c.id)).toEqual([
      "fixado-urgente",
      "fixado-velho",
      "urgente-velho",
      "recente",
      "antigo",
    ]);
  });
  it("não altera a lista original", () => {
    const lista = [item("a", 5), item("b", 1)];
    ordenarParaMorador(lista);
    expect(lista.map((c) => c.id)).toEqual(["a", "b"]);
  });
  it("sem data vai para o fim", () => {
    const lista = [item("sem", 0, { publicadoEm: null }), item("com", 3)];
    expect(ordenarParaMorador(lista).map((c) => c.id)).toEqual(["com", "sem"]);
  });
  it("Início mostra só os 3 primeiros", () => {
    const lista = [item("a", 1), item("b", 2), item("c", 3), item("d", 4, { fixado: true })];
    expect(destaquesDoInicio(lista).map((c) => c.id)).toEqual(["d", "a", "b"]);
  });
});

describe("limpeza do texto", () => {
  it("troca \\r\\n, tira espaços no fim das linhas e excesso de linhas em branco", () => {
    expect(limparTexto("  Olá  \r\n\r\n\r\n\r\nTchau \t ")).toBe("Olá\n\nTchau");
  });
  it("tira caracteres invisíveis de controle", () => {
    expect(limparTexto("a\u0000b​c‮d")).toBe("abcd");
  });
  it("mantém o HTML como texto (a tela escapa; aqui não some nada)", () => {
    expect(limparTexto("<b>oi</b>")).toBe("<b>oi</b>");
  });
  it("título vira uma linha só", () => {
    expect(limparTitulo("  Falta\n de   água ")).toBe("Falta de água");
  });
  it("separa parágrafos pela linha em branco", () => {
    expect(paragrafos("Linha 1\nLinha 2\n\nOutro parágrafo")).toEqual(["Linha 1\nLinha 2", "Outro parágrafo"]);
    expect(paragrafos("   ")).toEqual([]);
  });
});

describe("resumir", () => {
  it("texto curto fica igual (numa linha)", () => {
    expect(resumir("Oi\ntudo bem", 50)).toBe("Oi tudo bem");
  });
  it("corta numa palavra inteira e põe reticências", () => {
    const r = resumir("A coleta de lixo passa a ser às terças e sextas pela manhã.", 30);
    expect(r.endsWith("…")).toBe(true);
    expect(r.length).toBeLessThanOrEqual(31);
    expect(r).toBe("A coleta de lixo passa a ser…");
  });
});

describe("WhatsApp", () => {
  const base = "https://portal.exemplo.com/";
  it("link do comunicado no portal", () => {
    expect(linkDoComunicado(base, "abc123")).toBe("https://portal.exemplo.com/comunicados/abc123");
  });
  it("mensagem com título em negrito, resumo e link", () => {
    const msg = mensagemWhatsApp(
      { titulo: "Falta de *água*", texto: "Quinta-feira, das 8h às 12h.", prioridade: "normal" },
      linkDoComunicado(base, "x1"),
      "Residencial Jardins do Lago",
    );
    expect(msg).toBe(
      "*Falta de água*\n\nQuinta-feira, das 8h às 12h.\n\nLeia o comunicado completo no portal do Residencial Jardins do Lago:\nhttps://portal.exemplo.com/comunicados/x1",
    );
  });
  it("urgente começa com *URGENTE*", () => {
    const msg = mensagemWhatsApp({ titulo: "T", texto: "x", prioridade: "urgente" }, "https://p/c");
    expect(msg.startsWith("*URGENTE*\n*T*")).toBe(true);
  });
  it("link do wa.me codifica o texto", () => {
    expect(linkCompartilharWhatsApp("a b&c")).toBe("https://wa.me/?text=a%20b%26c");
  });
});

describe("mudanças de situação", () => {
  it("publicar", () => {
    expect(conferirMudanca({ status: "rascunho", fixado: false }, "publicar")).toBeNull();
    expect(conferirMudanca({ status: "arquivado", fixado: false }, "publicar")).toBeNull();
    expect(conferirMudanca({ status: "publicado", fixado: false }, "publicar")).toMatch(/já está publicado/);
    expect(statusDepois("rascunho", "publicar")).toBe("publicado");
  });
  it("arquivar (despublicar)", () => {
    expect(conferirMudanca({ status: "publicado", fixado: true }, "arquivar")).toBeNull();
    expect(conferirMudanca({ status: "arquivado", fixado: false }, "arquivar")).toMatch(/já está arquivado/);
    expect(statusDepois("publicado", "arquivar")).toBe("arquivado");
  });
  it("fixar só publicado", () => {
    expect(conferirMudanca({ status: "rascunho", fixado: false }, "fixar")).toMatch(/publicado/);
    expect(conferirMudanca({ status: "publicado", fixado: false }, "fixar")).toBeNull();
    expect(conferirMudanca({ status: "publicado", fixado: true }, "fixar")).toMatch(/já está fixado/);
    expect(statusDepois("publicado", "fixar")).toBe("publicado");
  });
  it("desafixar", () => {
    expect(conferirMudanca({ status: "publicado", fixado: true }, "desafixar")).toBeNull();
    expect(conferirMudanca({ status: "publicado", fixado: false }, "desafixar")).toMatch(/não está fixado/);
  });
});

describe("validação do formulário", () => {
  const valido = { titulo: " Coleta de lixo ", texto: "Terças e sextas.\r\n", prioridade: "normal", destino: "salvar" };

  it("aceita e limpa os campos", () => {
    const r = esquemaComunicado.parse({ ...valido, fixado: "on" });
    expect(r).toEqual({
      id: null,
      titulo: "Coleta de lixo",
      texto: "Terças e sextas.",
      prioridade: "normal",
      fixado: true,
      destino: "salvar",
      fotos: [],
    });
  });
  it("fotos: um campo vira lista; vários campos mantêm a ordem", () => {
    expect(esquemaComunicado.parse({ ...valido, fotos: "atual:0" }).fotos).toEqual(["atual:0"]);
    expect(esquemaComunicado.parse({ ...valido, fotos: ["atual:1", "atual:0"] }).fotos).toEqual(["atual:1", "atual:0"]);
  });
  it("caixa de fixar desmarcada = falso", () => {
    expect(esquemaComunicado.parse(valido).fixado).toBe(false);
  });
  it("recusa título curto, texto vazio, prioridade e destino desconhecidos", () => {
    expect(esquemaComunicado.safeParse({ ...valido, titulo: "  a " }).success).toBe(false);
    expect(esquemaComunicado.safeParse({ ...valido, texto: "   \n\n " }).success).toBe(false);
    expect(esquemaComunicado.safeParse({ ...valido, prioridade: "altissima" }).success).toBe(false);
    expect(esquemaComunicado.safeParse({ ...valido, destino: "apagar" }).success).toBe(false);
  });
  it("recusa texto grande demais", () => {
    expect(esquemaComunicado.safeParse({ ...valido, texto: "x".repeat(5001) }).success).toBe(false);
  });
  it("recusa id com caminho", () => {
    expect(esquemaComunicado.safeParse({ ...valido, id: "../outro" }).success).toBe(false);
    expect(esquemaMudanca.safeParse({ id: "../x", mudanca: "publicar" }).success).toBe(false);
  });
  it("mudança precisa ser conhecida", () => {
    expect(esquemaMudanca.parse({ id: "abc", mudanca: "arquivar" })).toEqual({ id: "abc", mudanca: "arquivar" });
    expect(esquemaMudanca.safeParse({ id: "abc", mudanca: "apagar" }).success).toBe(false);
  });
});
