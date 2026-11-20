import { describe, expect, it } from "vitest";
import { agruparPorCasa, contarCasas, ehOrdemPessoas, numeroDoRotulo, ordenarPessoas } from "@/lib/lista-pessoas";

const pessoas = [
  { nome: "Zélia", unitId: "casa-010" },
  { nome: "ana", unitId: "casa-002" },
  { nome: "Bruno", unitId: "casa-010" },
  { nome: "Carlos (portaria)", unitId: null },
  { nome: "Ângela", unitId: "casa-100" },
];
const numero = (id: string) => Number(id.slice(-3));

describe("ordenarPessoas", () => {
  it("por nome: A a Z, sem diferença de acento e maiúsculas", () => {
    expect(ordenarPessoas(pessoas, "nome", numero).map((p) => p.nome)).toEqual(["ana", "Ângela", "Bruno", "Carlos (portaria)", "Zélia"]);
  });

  it("por casa: número da casa (2 antes de 10 e de 100), na mesma casa por nome, equipe no fim", () => {
    expect(ordenarPessoas(pessoas, "casa", numero).map((p) => p.nome)).toEqual(["ana", "Bruno", "Zélia", "Ângela", "Carlos (portaria)"]);
  });

  it("não mexe na lista original", () => {
    const copia = [...pessoas];
    ordenarPessoas(pessoas, "casa", numero);
    expect(pessoas).toEqual(copia);
  });
});

describe("agruparPorCasa", () => {
  const gente = [
    { nome: "Zélia", unitId: "casa-010", papel: "morador", login: false },
    { nome: "Bruno", unitId: "casa-010", papel: "morador", login: true },
    { nome: "ana", unitId: "casa-002", papel: "morador", login: false },
    { nome: "Carlos", unitId: null, papel: "portaria", login: false },
    { nome: "Marta", unitId: null, papel: "admin", login: false },
  ];
  const temLogin = (p: (typeof gente)[number]) => p.login;

  it("uma casa por linha; quem tem o login vem primeiro; equipe fica separada", () => {
    const { casas, semCasa } = agruparPorCasa(gente, "casa", numero, temLogin);
    expect(casas.map((c) => c.unitId)).toEqual(["casa-002", "casa-010"]);
    expect(casas[1].pessoas.map((p) => p.nome)).toEqual(["Bruno", "Zélia"]);
    expect(casas[1].comLogin?.nome).toBe("Bruno");
    expect(casas[0].comLogin).toBeNull();
    expect(semCasa.map((p) => p.nome)).toEqual(["Carlos", "Marta"]);
  });

  it("por nome: as casas seguem o nome da primeira pessoa", () => {
    const { casas } = agruparPorCasa(gente, "nome", numero, temLogin);
    expect(casas.map((c) => c.pessoas[0].nome)).toEqual(["ana", "Bruno"]);
  });
});

describe("apoio", () => {
  it("lê o número do rótulo da casa", () => {
    expect(numeroDoRotulo("Casa 135")).toBe(135);
    expect(numeroDoRotulo("Lote 12-B")).toBe(12);
    expect(numeroDoRotulo("Portaria")).toBeNull();
    expect(numeroDoRotulo(null)).toBeNull();
  });

  it("conta casas diferentes (sem contar quem não tem casa)", () => {
    expect(contarCasas(pessoas)).toBe(3);
  });

  it("aceita só as ordens conhecidas", () => {
    expect(ehOrdemPessoas("casa")).toBe(true);
    expect(ehOrdemPessoas("nome")).toBe(true);
    expect(ehOrdemPessoas("x")).toBe(false);
  });
});
