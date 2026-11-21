/**
 * Sincronização: quais módulos cada ação muda e quais cada tela mostra.
 */
import { describe, expect, it } from "vitest";
import { ACOES_AUDITADAS } from "@/server/auditoria";
import {
  FOLGA_RELOGIO_MS,
  lerSinais,
  MODULO_DA_ACAO,
  MODULOS_SINC,
  modulosDaTela,
  modulosQueMudaram,
} from "@/lib/sincronizacao";

describe("MODULO_DA_ACAO", () => {
  it("toda ação da auditoria está na lista", () => {
    for (const acao of ACOES_AUDITADAS) expect(acao in MODULO_DA_ACAO, acao).toBe(true);
  });

  it("entrar e sair não fazem as telas recarregarem", () => {
    expect(MODULO_DA_ACAO["sessao.entrar"]).toBeNull();
    expect(MODULO_DA_ACAO["sessao.sair"]).toBeNull();
  });

  it("cada assunto marca o módulo certo", () => {
    expect(MODULO_DA_ACAO["visitante.autorizar"]).toBe("portaria");
    expect(MODULO_DA_ACAO["acesso.entrada"]).toBe("portaria");
    expect(MODULO_DA_ACAO["encomenda.registrar"]).toBe("portaria");
    expect(MODULO_DA_ACAO["reserva.criar"]).toBe("reservas");
    expect(MODULO_DA_ACAO["financeiro.publicar"]).toBe("financeiro");
    expect(MODULO_DA_ACAO["enquete.votar"]).toBe("enquetes");
    expect(MODULO_DA_ACAO["membro.suspender"]).toBe("pessoas");
  });
});

describe("modulosDaTela", () => {
  it("a portaria acompanha visitas, encomendas e casas (não as reservas)", () => {
    expect(modulosDaTela("/portaria")).toEqual(expect.arrayContaining(["portaria", "pessoas"]));
    expect(modulosDaTela("/portaria")).not.toContain("reservas");
  });

  it("telas de um assunto só acompanham esse assunto", () => {
    expect(modulosDaTela("/visitas")).toEqual(["portaria"]);
    expect(modulosDaTela("/admin/reservas/areas")).toEqual(["reservas"]);
    expect(modulosDaTela("/admin/solicitacoes/abc")).toEqual(["solicitacoes"]);
  });

  it("telas desconhecidas acompanham tudo", () => {
    for (const c of ["/qualquer", "/conta", "/relatorio"]) {
      expect(modulosDaTela(c), c).toEqual(MODULOS_SINC);
    }
  });

  it("início e painel acompanham tudo MENOS a votação (o painel da votação se atualiza sozinho)", () => {
    const semVotacao = MODULOS_SINC.filter((m) => m !== "eleicoes");
    for (const c of ["/inicio", "/admin", "/admin/relatorios", "/admin/auditoria", "/admin/unidades/casa-001", "/admin/links"]) {
      expect(modulosDaTela(c), c).toEqual(semVotacao);
      expect(modulosDaTela(c), c).not.toContain("eleicoes");
    }
  });

  it("as telas da votação continuam acompanhando a votação", () => {
    expect(modulosDaTela("/admin/votacao")).toEqual(["eleicoes"]);
    expect(modulosDaTela("/admin/votacao/abc/links")).toEqual(["eleicoes"]);
    expect(modulosDaTela("/votacao")).toEqual(["eleicoes"]);
    expect(modulosDaTela("/votacao/abc")).toEqual(["eleicoes"]);
    expect(modulosDaTela("/notificacoes")).toContain("eleicoes");
  });

  it("caminhos parecidos não se confundem (/administracao não é /admin)", () => {
    expect(modulosDaTela("/administracao")).toEqual(MODULOS_SINC);
    expect(modulosDaTela("/iniciou")).toEqual(MODULOS_SINC);
  });
});

describe("lerSinais", () => {
  it("aceita só módulos conhecidos com números válidos", () => {
    expect(lerSinais({ reservas: 10, portaria: "x", outro: 5, financeiro: -1, enquetes: Infinity })).toEqual({ reservas: 10 });
    expect(lerSinais(null)).toEqual({});
    expect(lerSinais("lixo")).toEqual({});
  });
});

describe("modulosQueMudaram", () => {
  const montadaEm = 1_000_000;

  it("primeira consulta: compara com a hora da tela (com folga do relógio)", () => {
    expect(modulosQueMudaram(null, { reservas: montadaEm + 10 }, montadaEm)).toEqual(["reservas"]);
    expect(modulosQueMudaram(null, { reservas: montadaEm - FOLGA_RELOGIO_MS + 1 }, montadaEm)).toEqual(["reservas"]);
    expect(modulosQueMudaram(null, { reservas: montadaEm - FOLGA_RELOGIO_MS - 1 }, montadaEm)).toEqual([]);
  });

  it("depois: só o que ficou mais novo que a consulta anterior", () => {
    const antes = { reservas: 100, portaria: 200 };
    expect(modulosQueMudaram(antes, { reservas: 100, portaria: 250 }, montadaEm)).toEqual(["portaria"]);
    expect(modulosQueMudaram(antes, { reservas: 100, portaria: 200 }, montadaEm)).toEqual([]);
    expect(modulosQueMudaram(antes, { reservas: 100, portaria: 200, enquetes: 5 }, montadaEm)).toEqual(["enquetes"]);
  });
});
