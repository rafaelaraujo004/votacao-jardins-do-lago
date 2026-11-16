import { describe, expect, it } from "vitest";
import { QUADRAS, TOTAL_LOTES, loteDoNumero } from "@/lib/planta";
import { RUAS, frenteDaCasa, rotaAte } from "@/lib/rotas";

type Ponto = [number, number];

/** O ponto está DENTRO do polígono (com uma margem para não contar a beirada)? */
function dentro(p: Ponto, poligono: [number, number][], margem = 4): boolean {
  const xs = poligono.map((v) => v[0]);
  const ys = poligono.map((v) => v[1]);
  if (p[0] < Math.min(...xs) + margem || p[0] > Math.max(...xs) - margem) return false;
  if (p[1] < Math.min(...ys) + margem || p[1] > Math.max(...ys) - margem) return false;
  let resultado = false;
  for (let i = 0, j = poligono.length - 1; i < poligono.length; j = i++) {
    const [xi, yi] = poligono[i];
    const [xj, yj] = poligono[j];
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) resultado = !resultado;
  }
  return resultado;
}

/** Pontos ao longo de um trecho, a cada ~4 unidades do desenho. */
function amostras(a: Ponto, b: Ponto): Ponto[] {
  const n = Math.max(2, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 4));
  return Array.from({ length: n + 1 }, (_, i) => [a[0] + ((b[0] - a[0]) * i) / n, a[1] + ((b[1] - a[1]) * i) / n] as Ponto);
}

describe("ruas do condomínio", () => {
  it("nenhum trecho de rua atravessa uma quadra de casas", () => {
    for (const [a, b] of RUAS.TRECHOS) {
      for (const p of amostras(RUAS.PONTOS[a], RUAS.PONTOS[b])) {
        for (const q of QUADRAS) {
          expect(dentro(p, q.contorno), `rua ${a}–${b} passa por dentro de ${q.id} em ${p.map(Math.round)}`).toBe(false);
        }
      }
    }
  });

  it("todo trecho liga pontos que existem", () => {
    for (const [a, b] of RUAS.TRECHOS) {
      expect(RUAS.PONTOS[a], a).toBeDefined();
      expect(RUAS.PONTOS[b], b).toBeDefined();
    }
  });
});

describe("como chegar (da portaria até a casa)", () => {
  it("toda casa de 1 a 225 tem caminho saindo da portaria", () => {
    for (let n = 1; n <= TOTAL_LOTES; n++) {
      const rota = rotaAte(n);
      expect(rota, `casa ${n}`).not.toBeNull();
      expect(rota!.pontos[0]).toEqual(RUAS.PONTOS.portao);
      expect(rota!.passos[0]).toMatch(/portaria/);
      expect(rota!.passos.at(-1)).toContain(`casa ${n}`);
    }
    expect(rotaAte(0)).toBeNull();
    expect(rotaAte(226)).toBeNull();
  });

  it("a frente da casa fica perto dela (a casa encosta na rua)", () => {
    for (let n = 1; n <= TOTAL_LOTES; n++) {
      const lote = loteDoNumero(n)!;
      const { ponto } = frenteDaCasa(lote);
      const centro: Ponto = [lote.x + lote.w / 2, lote.y + lote.h / 2];
      expect(Math.hypot(ponto[0] - centro[0], ponto[1] - centro[1]), `casa ${n}`).toBeLessThan(75);
    }
  });

  it("o caminho nunca passa por dentro de uma quadra", () => {
    for (let n = 1; n <= TOTAL_LOTES; n++) {
      const { pontos } = rotaAte(n)!;
      for (let i = 1; i < pontos.length; i++) {
        for (const p of amostras(pontos[i - 1], pontos[i])) {
          for (const q of QUADRAS) expect(dentro(p, q.contorno), `casa ${n}: passa por ${q.id}`).toBe(false);
        }
      }
    }
  });

  it("casas da rua de baixo: caminho curto (entra e vira na primeira rua)", () => {
    const rota = rotaAte(20)!;
    expect(rota.passos.length).toBeLessThanOrEqual(3);
    // A casa 200 (alto, junto ao muro) fica bem mais longe que a 20.
    const comprimento = (r: { pontos: Ponto[] }) =>
      r.pontos.slice(1).reduce((s, p, i) => s + Math.hypot(p[0] - r.pontos[i][0], p[1] - r.pontos[i][1]), 0);
    expect(comprimento(rotaAte(200)!)).toBeGreaterThan(comprimento(rota));
  });
});
