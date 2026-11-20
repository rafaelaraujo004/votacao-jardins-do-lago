import { describe, expect, it } from "vitest";
import { contarCasas, ehOrdemPessoas, numeroDoRotulo, ordenarPessoas } from "@/lib/lista-pessoas";

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
