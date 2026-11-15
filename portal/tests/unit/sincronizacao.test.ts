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
  it("a portaria acompanha visitas, reservas e casas", () => {
    expect(modulosDaTela("/portaria")).toEqual(expect.arrayContaining(["portaria", "reservas", "pessoas"]));
  });

  it("telas de um assunto só acompanham esse assunto", () => {
    expect(modulosDaTela("/visitas")).toEqual(["portaria"]);
    expect(modulosDaTela("/admin/reservas/areas")).toEqual(["reservas"]);
    expect(modulosDaTela("/admin/solicitacoes/abc")).toEqual(["solicitacoes"]);
  });

  it("início, painel e telas desconhecidas acompanham tudo", () => {
    for (const c of ["/inicio", "/admin", "/admin/relatorios", "/admin/auditoria", "/qualquer"]) {
      expect(modulosDaTela(c), c).toEqual(MODULOS_SINC);
    }
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
