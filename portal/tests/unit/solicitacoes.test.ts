/**
 * Regras das solicitações (sem banco): protocolo, situações permitidas,
 * privacidade da linha do tempo e validação dos formulários.
 */
import { describe, expect, it } from "vitest";
import {
  contarPorStatus,
  descreverMudanca,
  formatarProtocolo,
  idContadorSolicitacoes,
  linhaDoTempoDoMorador,
  ordenarAtualizacoes,
  ordenarSolicitacoes,
  paraAtualizacao,
  paraSolicitacao,
  podeCancelarMorador,
  podeComentarMorador,
  podeMudarStatus,
  proximoNumero,
  REGEX_PROTOCOLO,
  STATUS_SOLICITACAO,
} from "@/lib/solicitacoes";
import {
  esquemaAbrirSolicitacao,
  esquemaComentarSolicitacao,
  esquemaMudarStatusSolicitacao,
  esquemaResponderSolicitacao,
  lerFiltrosSolicitacoes,
} from "@/lib/validacao-solicitacoes";

describe("protocolo", () => {
  it("formata ano + número com 4 dígitos", () => {
    expect(formatarProtocolo(2026, 1)).toBe("2026-0001");
    expect(formatarProtocolo(2026, 123)).toBe("2026-0123");
    expect(formatarProtocolo(2026, 12345)).toBe("2026-12345");
    expect(REGEX_PROTOCOLO.test("2026-0001")).toBe(true);
  });

  it("um contador por ano", () => {
    expect(idContadorSolicitacoes(2026)).toBe("solicitacoes-2026");
  });

  it("próximo número começa do 1 e ignora lixo", () => {
    expect(proximoNumero(undefined)).toBe(1);
    expect(proximoNumero(null)).toBe(1);
    expect(proximoNumero("7")).toBe(1);
    expect(proximoNumero(-3)).toBe(1);
    expect(proximoNumero(1.5)).toBe(1);
    expect(proximoNumero(0)).toBe(1);
    expect(proximoNumero(41)).toBe(42);
  });
});

describe("situações", () => {
  it("transições permitidas para a administração", () => {
    expect(podeMudarStatus("aberta", "em_andamento")).toBe(true);
    expect(podeMudarStatus("aberta", "resolvida")).toBe(true);
    expect(podeMudarStatus("em_andamento", "resolvida")).toBe(true);
    expect(podeMudarStatus("resolvida", "em_andamento")).toBe(true);
    expect(podeMudarStatus("cancelada", "aberta")).toBe(true);
    expect(podeMudarStatus("resolvida", "cancelada")).toBe(false);
    expect(podeMudarStatus("cancelada", "resolvida")).toBe(false);
    for (const s of STATUS_SOLICITACAO) expect(podeMudarStatus(s, s)).toBe(false);
  });

  it("morador cancela só enquanto aberta e comenta enquanto viva", () => {
    expect(podeCancelarMorador("aberta")).toBe(true);
    expect(podeCancelarMorador("em_andamento")).toBe(false);
    expect(podeCancelarMorador("resolvida")).toBe(false);
    expect(podeComentarMorador("aberta")).toBe(true);
    expect(podeComentarMorador("em_andamento")).toBe(true);
    expect(podeComentarMorador("resolvida")).toBe(false);
    expect(podeComentarMorador("cancelada")).toBe(false);
  });

  it("descreve a mudança e conta por situação", () => {
    expect(descreverMudanca({ deStatus: "aberta", paraStatus: "em_andamento" })).toBe("Situação: Aberta → Em andamento");
    expect(descreverMudanca({ deStatus: null, paraStatus: "resolvida" })).toBe("Situação: Resolvida");
    expect(contarPorStatus([{ status: "aberta" }, { status: "aberta" }, { status: "resolvida" }])).toEqual({
      aberta: 2,
      em_andamento: 0,
      resolvida: 1,
      cancelada: 0,
    });
  });
});

describe("conversão dos documentos (lista fechada)", () => {
  it("nunca devolve o uid de quem abriu e trata valores estranhos", () => {
    const s = paraSolicitacao("t1", {
      protocolo: "2026-0001",
      unitId: "casa-012",
      unidadeRotulo: "Casa 12",
      categoria: "inventada",
      local: "Portão",
      descricao: "Portão travando ao abrir",
      status: "???",
      criadoPor: "uid-secreto",
      criadoEm: { toDate: () => new Date("2026-11-10T12:00:00Z") },
    });
    expect(s.categoria).toBe("outro");
    expect(s.status).toBe("cancelada");
    expect(s.criadoEm?.toISOString()).toBe("2026-11-10T12:00:00.000Z");
    expect(JSON.stringify(s)).not.toContain("uid-secreto");
  });

  it("atualização sem publico === true é tratada como interna", () => {
    expect(paraAtualizacao("u1", { texto: "x" }).publico).toBe(false);
    expect(paraAtualizacao("u2", { texto: "x", publico: "true" }).publico).toBe(false);
    expect(paraAtualizacao("u3", { texto: "x", publico: true }).publico).toBe(true);
    expect(JSON.stringify(paraAtualizacao("u4", { autorUid: "uid-secreto", publico: true }))).not.toContain("uid-secreto");
  });
});

describe("linha do tempo do morador", () => {
  const itens = [
    paraAtualizacao("a", { tipo: "comentario", texto: "Vamos verificar", autorNome: "José Síndico", autorPapel: "admin", publico: true }),
    paraAtualizacao("b", { tipo: "comentario", texto: "Morador já reclamou 3 vezes", autorNome: "José Síndico", autorPapel: "admin", publico: false }),
    paraAtualizacao("c", { tipo: "comentario", texto: "Obrigado", autorNome: "Maria", autorPapel: "morador", publico: true }),
  ];

  it("tira as notas internas", () => {
    const vista = linhaDoTempoDoMorador(itens);
    expect(vista.map((a) => a.id)).toEqual(["a", "c"]);
    expect(JSON.stringify(vista)).not.toContain("reclamou");
  });

  it("a administração aparece como 'Administração'", () => {
    const vista = linhaDoTempoDoMorador(itens);
    expect(vista[0].autorNome).toBe("Administração");
    expect(vista[1].autorNome).toBe("Maria");
  });

  it("ordena: mais antiga primeiro; no mesmo instante a mudança de situação vem antes", () => {
    const t = (iso: string) => ({ toDate: () => new Date(iso) });
    const lista = ordenarAtualizacoes([
      paraAtualizacao("nota", { tipo: "comentario", criadoEm: t("2026-11-10T10:00:00Z") }),
      paraAtualizacao("status", { tipo: "status", criadoEm: t("2026-11-10T10:00:00Z") }),
      paraAtualizacao("antiga", { tipo: "comentario", criadoEm: t("2026-11-09T10:00:00Z") }),
    ]);
    expect(lista.map((a) => a.id)).toEqual(["antiga", "status", "nota"]);
  });

  it("solicitações: mais novas primeiro", () => {
    const t = (iso: string) => ({ toDate: () => new Date(iso) });
    const lista = ordenarSolicitacoes([
      paraSolicitacao("velha", { protocolo: "2026-0001", criadoEm: t("2026-01-01T10:00:00Z") }),
      paraSolicitacao("nova", { protocolo: "2026-0002", criadoEm: t("2026-02-01T10:00:00Z") }),
    ]);
    expect(lista.map((s) => s.id)).toEqual(["nova", "velha"]);
  });
});

describe("validação dos formulários", () => {
  it("abrir: categoria, local e descrição de 10 a 1000", () => {
    expect(esquemaAbrirSolicitacao.safeParse({ categoria: "limpeza", local: "Praça", descricao: "Lixo acumulado na praça" }).success).toBe(true);
    expect(esquemaAbrirSolicitacao.safeParse({ categoria: "limpeza", local: "Praça", descricao: "curta" }).success).toBe(false);
    expect(esquemaAbrirSolicitacao.safeParse({ categoria: "limpeza", local: "Praça", descricao: "x".repeat(1001) }).success).toBe(false);
    expect(esquemaAbrirSolicitacao.safeParse({ categoria: "outra", local: "Praça", descricao: "Lixo acumulado na praça" }).success).toBe(false);
    expect(esquemaAbrirSolicitacao.safeParse({ categoria: "limpeza", local: " ", descricao: "Lixo acumulado na praça" }).success).toBe(false);
  });

  it("a casa nunca vem do formulário", () => {
    const r = esquemaAbrirSolicitacao.parse({ categoria: "limpeza", local: "Praça", descricao: "Lixo acumulado", unitId: "casa-099" });
    expect(r).not.toHaveProperty("unitId");
  });

  it("comentar e responder", () => {
    expect(esquemaComentarSolicitacao.safeParse({ id: "abc", texto: "ok" }).success).toBe(true);
    expect(esquemaComentarSolicitacao.safeParse({ id: "../x", texto: "ok" }).success).toBe(false);
    expect(esquemaResponderSolicitacao.parse({ id: "abc", texto: "Nota", publico: "nao" }).publico).toBe(false);
    expect(esquemaResponderSolicitacao.safeParse({ id: "abc", texto: "Nota" }).success).toBe(false);
  });

  it("mudar situação: comentário opcional, público por padrão", () => {
    const r = esquemaMudarStatusSolicitacao.parse({ id: "abc", status: "resolvida" });
    expect(r).toEqual({ id: "abc", status: "resolvida", comentario: "", publico: true });
    expect(esquemaMudarStatusSolicitacao.safeParse({ id: "abc", status: "apagada" }).success).toBe(false);
  });

  it("cancelar (não atender) exige um comentário que o morador possa ler", () => {
    expect(esquemaMudarStatusSolicitacao.safeParse({ id: "abc", status: "cancelada" }).success).toBe(false);
    expect(esquemaMudarStatusSolicitacao.safeParse({ id: "abc", status: "cancelada", comentario: "ok" }).success).toBe(false);
    expect(
      esquemaMudarStatusSolicitacao.safeParse({ id: "abc", status: "cancelada", comentario: "Fora do condomínio.", publico: "nao" }).success,
    ).toBe(false);
    const r = esquemaMudarStatusSolicitacao.parse({ id: "abc", status: "cancelada", comentario: "Fora da área do condomínio.", publico: "sim" });
    expect(r).toEqual({ id: "abc", status: "cancelada", comentario: "Fora da área do condomínio.", publico: true });
  });

  it("filtros do endereço: valores estranhos voltam ao padrão", () => {
    expect(lerFiltrosSolicitacoes({})).toEqual({ status: "ativas", categoria: "todas" });
    expect(lerFiltrosSolicitacoes({ status: "resolvida", categoria: "limpeza" })).toEqual({ status: "resolvida", categoria: "limpeza" });
    expect(lerFiltrosSolicitacoes({ status: "<script>", categoria: ["seguranca", "x"] })).toEqual({ status: "ativas", categoria: "seguranca" });
  });
});
