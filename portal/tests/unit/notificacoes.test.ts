/**
 * Sino de notificações: o que é novo, o número do sino, a ordem e a leitura segura
 * do que vem da rota /api/notificacoes.
 */
import { describe, expect, it } from "vitest";
import {
  contarSino,
  dentroDaJanela,
  ehNova,
  lerNotificacoes,
  LIMITE_NOTIFICACOES,
  montarLista,
  quandoFoi,
  rotuloContagem,
  separarNotificacoes,
  type Notificacao,
} from "@/lib/notificacoes";

const HORA = 60 * 60 * 1000;
const agora = Date.UTC(2026, 10, 20, 15, 0);

function n(id: string, quando: number, acao = false): Notificacao {
  return { id, tipo: "comunicado", titulo: id, texto: "", href: "/comunicados", quando, acao, tom: "info" };
}

describe("novo e número do sino", () => {
  it("sem nunca ter aberto o sino, tudo é novo", () => {
    expect(ehNova(n("a", agora - 100 * HORA), null)).toBe(true);
  });

  it("é novo o que aconteceu depois da última vez que abriu (com 1 min de folga)", () => {
    const vistasEm = agora - 2 * HORA;
    expect(ehNova(n("depois", agora - HORA), vistasEm)).toBe(true);
    expect(ehNova(n("antes", agora - 3 * HORA), vistasEm)).toBe(false);
    expect(ehNova(n("quase", vistasEm - 30_000), vistasEm)).toBe(true);
  });

  it("conta o que pede ação (mesmo já visto) + o que é novo, sem repetir", () => {
    const vistasEm = agora - 2 * HORA;
    const lista = [n("acao-vista", agora - 5 * HORA, true), n("nova", agora - HORA), n("velha", agora - 9 * HORA), n("acao-nova", agora, true)];
    expect(contarSino(lista, vistasEm)).toBe(3);
  });

  it("mostra 9+ acima de nove", () => {
    expect(rotuloContagem(3)).toBe("3");
    expect(rotuloContagem(10)).toBe("9+");
  });
});

describe("ordem e montagem", () => {
  it("o que pede ação vem primeiro; depois o mais recente", () => {
    const lista = montarLista([[n("velha", 1), n("nova", 3)], [n("acao", 2, true)]]);
    expect(lista.map((x) => x.id)).toEqual(["acao", "nova", "velha"]);
  });

  it("tira repetidas e respeita o teto", () => {
    const muitas = Array.from({ length: LIMITE_NOTIFICACOES + 10 }, (_, i) => n(`x${i}`, i));
    expect(montarLista([muitas, [n("x1", 999)]])).toHaveLength(LIMITE_NOTIFICACOES);
    expect(montarLista([[n("a", 1)], [n("a", 2)]])).toHaveLength(1);
  });

  it("separa 'Precisa de você' e 'Novidades'", () => {
    const { acao, outras } = separarNotificacoes([n("a", 1), n("b", 2, true)]);
    expect(acao.map((x) => x.id)).toEqual(["b"]);
    expect(outras.map((x) => x.id)).toEqual(["a"]);
  });
});

describe("janela de dias e 'há quanto tempo'", () => {
  it("entra o que é dos últimos 30 dias", () => {
    const hoje = new Date(agora);
    expect(dentroDaJanela(new Date(agora - 29 * 24 * HORA), hoje)).toBe(true);
    expect(dentroDaJanela(new Date(agora - 31 * 24 * HORA), hoje)).toBe(false);
    expect(dentroDaJanela(null, hoje)).toBe(false);
  });

  it("escreve em linguagem simples", () => {
    expect(quandoFoi(agora - 30_000, agora)).toBe("agora há pouco");
    expect(quandoFoi(agora - 15 * 60_000, agora)).toBe("há 15 min");
    expect(quandoFoi(agora - 3 * HORA, agora)).toBe("há 3 h");
    expect(quandoFoi(agora - 30 * HORA, agora)).toBe("ontem");
    expect(quandoFoi(agora - 4 * 24 * HORA, agora)).toBe("há 4 dias");
    expect(quandoFoi(agora - 10 * 24 * HORA, agora, "America/Belem")).toBe("10/11/2026");
  });
});

describe("lerNotificacoes (o que vem da rota)", () => {
  it("aceita só itens no formato certo e com link interno", () => {
    const lidas = lerNotificacoes([
      n("ok", 1),
      { ...n("fora", 1), href: "https://golpe.exemplo.com" },
      { ...n("barra-dupla", 1), href: "//golpe.exemplo.com" },
      { ...n("tipo", 1), tipo: "outro" },
      { ...n("tom", 1), tom: "piscando" },
      "lixo",
    ]);
    expect(lidas.map((x) => x.id)).toEqual(["ok", "tom"]);
    expect(lidas[1].tom).toBe("neutro");
    expect(lerNotificacoes(null)).toEqual([]);
  });
});
