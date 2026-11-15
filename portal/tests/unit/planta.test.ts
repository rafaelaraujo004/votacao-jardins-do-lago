import { describe, expect, it } from "vitest";
import { LOTES, QUADRAS, TOTAL_LOTES, loteDoNumero, type Lote } from "@/lib/planta";

const centroY = (l: Lote) => l.y + l.h / 2;
const centroX = (l: Lote) => l.x + l.w / 2;
const lote = (n: number) => {
  const l = loteDoNumero(n);
  if (!l) throw new Error(`lote ${n} não existe`);
  return l;
};

describe("planta real (conferida em docs/MAPA-LOTES.md)", () => {
  it("tem os lotes 1 a 225, cada um uma única vez", () => {
    expect(TOTAL_LOTES).toBe(225);
    expect(LOTES).toHaveLength(225);
    expect(LOTES.map((l) => l.numero)).toEqual(Array.from({ length: 225 }, (_, i) => i + 1));
    expect(loteDoNumero(0)).toBeNull();
    expect(loteDoNumero(226)).toBeNull();
  });

  it("nenhum lote fica em cima de outro", () => {
    const folga = 0.01;
    for (let i = 0; i < LOTES.length; i++) {
      for (let j = i + 1; j < LOTES.length; j++) {
        const a = LOTES[i];
        const b = LOTES[j];
        const cruzam =
          a.x + folga < b.x + b.w && b.x + folga < a.x + a.w && a.y + folga < b.y + b.h && b.y + folga < a.y + a.h;
        expect(cruzam, `lotes ${a.numero} e ${b.numero} se sobrepõem`).toBe(false);
      }
    }
  });

  it("todo lote tem tamanho e um trecho descrito", () => {
    for (const l of LOTES) {
      expect(l.w).toBeGreaterThan(10);
      expect(l.h).toBeGreaterThan(10);
      expect(l.trecho.length).toBeGreaterThan(3);
    }
    expect(new Set(QUADRAS.map((q) => q.id)).size).toBe(QUADRAS.length);
  });

  it("fileira de baixo: 01 a 43 da esquerda para a direita, com a portaria entre o 05 e o 6", () => {
    for (let n = 2; n <= 43; n++) expect(centroX(lote(n))).toBeGreaterThan(centroX(lote(n - 1)));
    expect(lote(6).x - (lote(5).x + lote(5).w)).toBeGreaterThan(60); // espaço da portaria
  });

  it("ponta esquerda: 44 embaixo até 53 em cima", () => {
    expect(centroY(lote(44))).toBeGreaterThan(centroY(lote(53)));
    expect(centroX(lote(44))).toBeCloseTo(centroX(lote(53)));
  });

  it.each([
    [54, 62, 63, 71],
    [72, 80, 81, 89],
    [90, 98, 99, 107],
    [108, 116, 117, 125],
    [126, 138, 139, 151],
    [152, 162, 163, 172],
    [173, 179, 180, 185],
    [186, 189, 190, 192],
    [207, 214, 215, 221],
  ])("quadra em U: %i desce até %i, %i sobe até %i", (a, b, c, d) => {
    // esquerda desce
    expect(centroY(lote(b))).toBeGreaterThan(centroY(lote(a)));
    // direita fica à direita e sobe
    expect(centroX(lote(c))).toBeGreaterThan(centroX(lote(b)));
    expect(centroY(lote(c))).toBeGreaterThan(centroY(lote(d)));
    // o primeiro da direita fica na mesma linha do último da esquerda (embaixo)
    expect(centroY(lote(c))).toBeCloseTo(centroY(lote(b)));
  });

  it("quadras com diagonal: o lote de cima fica sozinho à esquerda", () => {
    for (const [sozinho, ultimoDireita] of [
      [152, 172],
      [173, 185],
      [186, 192],
      [207, 221],
    ]) {
      expect(centroY(lote(sozinho))).toBeLessThan(lote(ultimoDireita).y);
    }
  });

  it("topo: coluna do muro sobe de 194 a 206; parquinho desce de 222 a 225", () => {
    for (let n = 195; n <= 206; n++) expect(centroY(lote(n))).toBeLessThan(centroY(lote(n - 1)));
    for (let n = 223; n <= 225; n++) expect(centroY(lote(n))).toBeGreaterThan(centroY(lote(n - 1)));
  });
});
