import { describe, expect, it } from "vitest";
import {
  faixasDeCasas,
  nomeApresentavel,
  normalizarNome,
  planejarImportacao,
  rotuloCasas,
  separarNomes,
  tirarAnotacoes,
  telefoneNacional,
  telefonesDaPessoa,
  uidDaLista,
  type CasaDoCadastro,
} from "@/lib/importar-moradores";

const casa = (n: number, status: "ativa" | "inativa" = "ativa"): CasaDoCadastro => ({
  id: `casa-${String(n).padStart(3, "0")}`,
  rotulo: `Casa ${n}`,
  numero: n,
  status,
});

describe("nomeApresentavel", () => {
  it("ajusta nomes escritos todos em maiúsculas", () => {
    expect(nomeApresentavel("MARIA DAS GRAÇAS")).toBe("Maria das Graças");
    expect(nomeApresentavel("  JOÃO   DE  SOUZA ")).toBe("João de Souza");
    expect(nomeApresentavel("ANA-CLARA D'ÁVILA E SILVA")).toBe("Ana-Clara D'Ávila e Silva");
  });

  it("não mexe em nomes já escritos normalmente", () => {
    expect(nomeApresentavel("Maria da Silva")).toBe("Maria da Silva");
    expect(nomeApresentavel("joão")).toBe("joão");
  });

  it("primeira palavra nunca fica minúscula, mesmo sendo partícula", () => {
    expect(nomeApresentavel("DA SILVA")).toBe("Da Silva");
  });

  it("corta em 80 caracteres", () => {
    expect(nomeApresentavel("A".repeat(100)).length).toBe(80);
  });
});

describe("tirarAnotacoes", () => {
  it("tira 'alugada/alugado' que a lista põe junto do nome", () => {
    expect(tirarAnotacoes("MARIA SILVA ALUGADA")).toBe("MARIA SILVA");
    expect(tirarAnotacoes("JOÃO (ALUGADO)")).toBe("JOÃO");
    expect(tirarAnotacoes("ALUGADA - ANA LIMA")).toBe("ANA LIMA");
    expect(tirarAnotacoes("Rita alugada")).toBe("Rita");
  });

  it("não mexe em nomes normais (nem em palavras que só começam igual)", () => {
    expect(tirarAnotacoes("Maria das Graças")).toBe("Maria das Graças");
    expect(tirarAnotacoes("Alugadinho Souza")).toBe("Alugadinho Souza");
  });

  it("no plano: 'NOME ALUGADA' vira só o nome; 'ALUGADA' sozinho vira contato da casa", () => {
    const plano = planejarImportacao({
      condominioId: "jardins-do-lago",
      casas: [casa(21), casa(22)],
      pessoas: [],
      contatos: [
        { unitId: "casa-021", nome: "MARIA SILVA ALUGADA", telefones: ["5594911111111"] },
        { unitId: "casa-022", nome: " / ALUGADA / ", telefones: [] },
      ],
    });
    expect(plano.novos.map((p) => p.nome)).toEqual(["Maria Silva", "Contato da Casa 22"]);
  });
});

describe("separarNomes", () => {
  it("separa pela barra (e outros separadores da lista)", () => {
    expect(separarNomes("MARIA / JOÃO")).toEqual(["MARIA", "JOÃO"]);
    expect(separarNomes("Ana\\Pedro|Lia;Rui")).toEqual(["Ana", "Pedro", "Lia", "Rui"]);
  });

  it("ignora partes vazias ou sem letras", () => {
    expect(separarNomes("MARIA /")).toEqual(["MARIA"]);
    expect(separarNomes(" / - / ")).toEqual([]);
    expect(separarNomes("ZÉ / MARIA")).toEqual(["ZÉ", "MARIA"]);
  });
});

describe("telefones", () => {
  it("tira o 55 do país", () => {
    expect(telefoneNacional("5594992221384")).toBe("94992221384");
    expect(telefoneNacional("94992221384")).toBe("94992221384");
  });

  it("1º telefone para o 1º nome, 2º para o 2º", () => {
    const tels = ["5594911111111", "5594922222222"];
    expect(telefonesDaPessoa(0, 2, tels)).toEqual({ telefone: "94911111111", telefone2: "" });
    expect(telefonesDaPessoa(1, 2, tels)).toEqual({ telefone: "94922222222", telefone2: "" });
  });

  it("com um nome só, ele fica com os dois telefones", () => {
    expect(telefonesDaPessoa(0, 1, ["5594911111111", "5594922222222"])).toEqual({
      telefone: "94911111111",
      telefone2: "94922222222",
    });
  });

  it("dois nomes e um telefone: o segundo fica sem", () => {
    expect(telefonesDaPessoa(1, 2, ["5594911111111"])).toEqual({ telefone: "", telefone2: "" });
  });
});

describe("uidDaLista", () => {
  it("é sempre o mesmo para a mesma casa e o mesmo nome (sem acento/maiúsculas)", () => {
    const a = uidDaLista("jardins-do-lago", "casa-012", "João Souza");
    expect(a).toMatch(/^lista-jardins-do-lago-casa-012-[0-9a-f]{8}$/);
    expect(uidDaLista("jardins-do-lago", "casa-012", "JOAO  SOUZA")).toBe(a);
    expect(uidDaLista("jardins-do-lago", "casa-012", "Maria")).not.toBe(a);
  });

  it("muda de um condomínio para outro e de uma casa para outra", () => {
    expect(uidDaLista("jardins-do-lago-demo", "casa-012", "Ana")).not.toBe(uidDaLista("jardins-do-lago", "casa-012", "Ana"));
    expect(uidDaLista("jardins-do-lago", "casa-013", "Ana")).not.toBe(uidDaLista("jardins-do-lago", "casa-012", "Ana"));
  });

  it("cabe em 64 caracteres mesmo com nomes longos", () => {
    const uid = uidDaLista("condominio-com-um-nome-bem-comprido-aqui", "quadra-muito-comprida-lote-12345", "Ana");
    expect(uid.length).toBeLessThanOrEqual(64);
    expect(uid).toMatch(/^[A-Za-z0-9_-]+$/);
  });
});

describe("planejarImportacao", () => {
  const condominioId = "jardins-do-lago";

  it("cada nome vira uma pessoa, com o telefone certo", () => {
    const plano = planejarImportacao({
      condominioId,
      casas: [casa(1), casa(2)],
      pessoas: [],
      contatos: [
        { unitId: "casa-001", nome: "MARIA DA SILVA / JOÃO SOUZA", telefones: ["5594911111111", "5594922222222"] },
        { unitId: "casa-002", nome: "Ana Lima", telefones: ["5594933333333"] },
      ],
    });
    expect(plano.novos.map((p) => [p.rotulo, p.nome, p.telefone])).toEqual([
      ["Casa 1", "Maria da Silva", "94911111111"],
      ["Casa 1", "João Souza", "94922222222"],
      ["Casa 2", "Ana Lima", "94933333333"],
    ]);
    expect(plano.jaCadastrados).toBe(0);
    expect(plano.casasNaLista).toBe(2);
  });

  it("rodar de novo não repete ninguém (mesmo identificador)", () => {
    const entrada = {
      condominioId,
      casas: [casa(1)],
      contatos: [{ unitId: "casa-001", nome: "MARIA / JOÃO", telefones: [] }],
    };
    const primeira = planejarImportacao({ ...entrada, pessoas: [] });
    const depois = planejarImportacao({
      ...entrada,
      pessoas: primeira.novos.map((p) => ({ uid: p.uid, papel: "morador", unitId: p.unitId, nome: p.nome })),
    });
    expect(primeira.novos).toHaveLength(2);
    expect(depois.novos).toHaveLength(0);
    expect(depois.jaCadastrados).toBe(2);
  });

  it("quem já está na casa com o mesmo nome (sem acento/maiúsculas) não entra de novo", () => {
    const plano = planejarImportacao({
      condominioId,
      casas: [casa(3)],
      pessoas: [{ uid: "abc", papel: "morador", unitId: "casa-003", nome: "Joao  Souza" }],
      contatos: [{ unitId: "casa-003", nome: "JOÃO SOUZA / ANA", telefones: [] }],
    });
    expect(plano.novos.map((p) => p.nome)).toEqual(["Ana"]);
    expect(plano.jaCadastrados).toBe(1);
  });

  it("mesmo nome em OUTRA casa entra normalmente", () => {
    const plano = planejarImportacao({
      condominioId,
      casas: [casa(3), casa(4)],
      pessoas: [{ uid: "abc", papel: "morador", unitId: "casa-003", nome: "Ana" }],
      contatos: [{ unitId: "casa-004", nome: "ANA", telefones: [] }],
    });
    expect(plano.novos).toHaveLength(1);
  });

  it("casa inativa e casa que não existe ficam de fora", () => {
    const plano = planejarImportacao({
      condominioId,
      casas: [casa(5, "inativa")],
      pessoas: [],
      contatos: [
        { unitId: "casa-005", nome: "Ana", telefones: [] },
        { unitId: "casa-999", nome: "Rui", telefones: [] },
      ],
    });
    expect(plano.novos).toHaveLength(0);
    expect(plano.casasInativas).toEqual([5]);
    expect(plano.casasNaoEncontradas).toBe(1);
  });

  it("aponta as casas ativas sem contato e sem morador", () => {
    const plano = planejarImportacao({
      condominioId,
      casas: [casa(1), casa(2), casa(3), casa(4, "inativa")],
      pessoas: [{ uid: "x", papel: "morador", unitId: "casa-003", nome: "Lia" }],
      contatos: [{ unitId: "casa-001", nome: "Ana", telefones: [] }],
    });
    expect(plano.casasSemContato).toEqual([2]);
  });

  it("linha sem nome aproveitável entra como contato da casa", () => {
    const plano = planejarImportacao({
      condominioId,
      casas: [casa(7)],
      pessoas: [],
      contatos: [{ unitId: "casa-007", nome: " - ", telefones: ["5594911111111"] }],
    });
    expect(plano.novos.map((p) => p.nome)).toEqual(["Contato da Casa 7"]);
  });

  it("morador excluído pelo síndico (da lista ou cadastrado à mão) não volta", () => {
    const plano = planejarImportacao({
      condominioId,
      casas: [casa(9)],
      pessoas: [],
      contatos: [{ unitId: "casa-009", nome: "ANA LIMA / RUI", telefones: [] }],
      excluidosPorCasa: { "casa-009": [normalizarNome("Ana Lima")] },
    });
    expect(plano.novos.map((p) => p.nome)).toEqual(["Rui"]);
    expect(plano.excluidosAntes).toBe(1);
  });

  it("a anotação de excluído vale só para aquela casa", () => {
    const plano = planejarImportacao({
      condominioId,
      casas: [casa(9), casa(15)],
      pessoas: [],
      contatos: [{ unitId: "casa-015", nome: "ANA LIMA", telefones: [] }],
      excluidosPorCasa: { "casa-009": [normalizarNome("Ana Lima")] },
    });
    expect(plano.novos).toHaveLength(1);
    expect(plano.excluidosAntes).toBe(0);
  });

  it("lista que muda de ordem não esconde a pessoa nova", () => {
    const casas = [casa(10)];
    const antes = planejarImportacao({ condominioId, casas, pessoas: [], contatos: [{ unitId: "casa-010", nome: "MARIA", telefones: [] }] });
    const pessoas = antes.novos.map((p) => ({ uid: p.uid, papel: "morador", unitId: p.unitId, nome: p.nome }));
    const depois = planejarImportacao({ condominioId, casas, pessoas, contatos: [{ unitId: "casa-010", nome: "JOÃO / MARIA", telefones: [] }] });
    expect(depois.novos.map((p) => p.nome)).toEqual(["João"]);
    expect(depois.jaCadastrados).toBe(1);
  });

  it("nome curto (apelido) entra e não passa o telefone dele para o vizinho", () => {
    const plano = planejarImportacao({
      condominioId,
      casas: [casa(11)],
      pessoas: [],
      contatos: [{ unitId: "casa-011", nome: "ZÉ / MARIA SOUZA", telefones: ["5594911111111", "5594922222222"] }],
    });
    expect(plano.novos.map((p) => [p.nome, p.telefone, p.telefone2])).toEqual([
      ["Zé", "94911111111", ""],
      ["Maria Souza", "94922222222", ""],
    ]);
  });

  it("parte sem nome aproveitável não desalinha os telefones", () => {
    const plano = planejarImportacao({
      condominioId,
      casas: [casa(13)],
      pessoas: [],
      contatos: [{ unitId: "casa-013", nome: "X / MARIA SOUZA", telefones: ["5594911111111", "5594922222222"] }],
    });
    expect(plano.novos.map((p) => [p.nome, p.telefone, p.telefone2])).toEqual([["Maria Souza", "94922222222", ""]]);
  });

  it("o mesmo nome duas vezes na linha vira uma pessoa com os dois telefones", () => {
    const plano = planejarImportacao({
      condominioId,
      casas: [casa(14)],
      pessoas: [],
      contatos: [{ unitId: "casa-014", nome: "ANA / ANA", telefones: ["5594911111111", "5594922222222"] }],
    });
    expect(plano.novos.map((p) => [p.nome, p.telefone, p.telefone2])).toEqual([["Ana", "94911111111", "94922222222"]]);
    expect(plano.jaCadastrados).toBe(0);
  });

  it("equipe com o mesmo nome não impede o morador de entrar", () => {
    const plano = planejarImportacao({
      condominioId,
      casas: [casa(8)],
      pessoas: [{ uid: "y", papel: "admin", unitId: null, nome: "Ana" }],
      contatos: [{ unitId: "casa-008", nome: "ANA", telefones: [] }],
    });
    expect(plano.novos).toHaveLength(1);
  });
});

describe("normalizarNome e faixasDeCasas", () => {
  it("compara nomes sem acento, maiúsculas nem espaços extras", () => {
    expect(normalizarNome("  JOÃO   Souza")).toBe(normalizarNome("joao souza"));
  });

  it("junta números seguidos em faixas", () => {
    expect(faixasDeCasas([198, 194, 195, 196, 197])).toBe("194 a 198");
    expect(faixasDeCasas([1, 2, 5, 7, 8, 9])).toBe("1, 2, 5 e 7 a 9");
    expect(faixasDeCasas([197, 198])).toBe("197 e 198");
    expect(faixasDeCasas([5, 7, 8])).toBe("5, 7 e 8");
    expect(faixasDeCasas([12])).toBe("12");
    expect(faixasDeCasas([])).toBe("");
  });

  it("rotuloCasas usa singular ou plural", () => {
    expect(rotuloCasas([12])).toBe("Casa 12");
    expect(rotuloCasas([194, 195, 196, 197, 198])).toBe("Casas 194 a 198");
  });
});
