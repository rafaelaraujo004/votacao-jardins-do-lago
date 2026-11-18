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

/** Pode andar de A para B? (mão única só no sentido da lista; mão dupla nos dois) */
function permitido(a: string, b: string): boolean {
  return RUAS.TRECHOS.some(([x, y, mao]) => (x === a && y === b) || (mao === "dupla" && x === b && y === a));
}

describe("mão das ruas (projeto de sinalização viária)", () => {
  it("nenhuma rota anda na contramão", () => {
    for (let n = 1; n <= TOTAL_LOTES; n++) {
      const rota = rotaAte(n)!;
      const [ta, tb] = rota.frente.trecho;
      for (let i = 1; i < rota.caminho.length; i++) {
        const [a, b] = [rota.caminho[i - 1], rota.caminho[i]];
        // Entrando no trecho da casa: precisa vir pela ponta de onde o trânsito vem.
        const ok =
          b === "frente"
            ? a === ta || (rota.frente.mao === "dupla" && a === tb)
            : a === "frente"
              ? b === tb || (rota.frente.mao === "dupla" && b === ta)
              : permitido(a, b);
        expect(ok, `casa ${n}: ${a} → ${b} é contramão`).toBe(true);
      }
    }
  });

  it("sentidos conferidos no PDF", () => {
    // Rua de baixo: só para a direita (afastando-se da portaria).
    expect(permitido("b296", "b420")).toBe(true);
    expect(permitido("b420", "b296")).toBe(false);
    // Ruas entre as quadras à direita da avenida: sobem.
    expect(permitido("b764", "d764")).toBe(true);
    expect(permitido("d764", "b764")).toBe(false);
    // Diagonal volta para a esquerda; rua em frente ao parque também.
    expect(permitido("d1236", "d1120")).toBe(true);
    expect(permitido("c420", "c296")).toBe(true);
    expect(permitido("c296", "c420")).toBe(false);
    // Avenida entre as quadras desce até a portaria; entre a APP e o parque é mão dupla.
    expect(permitido("c296", "b296")).toBe(true);
    expect(permitido("b296", "c296")).toBe(false);
    expect(permitido("t296", "c296") && permitido("c296", "t296")).toBe(true);
    // Rua do muro desce.
    expect(permitido("t168alto", "t168baixo")).toBe(true);
    expect(permitido("t168baixo", "t168alto")).toBe(false);
  });

  it("casa da rua da avenida (q. 54–71) é alcançada descendo, pelo circuito", () => {
    const rota = rotaAte(60)!;
    // Não dá para subir a rua das casas 54–62 vindo da rua de baixo: o caminho chega por cima.
    expect(rota.caminho).toContain("c172");
    expect(rota.caminho.indexOf("c172")).toBeLessThan(rota.caminho.indexOf("frente"));
  });
});

describe("passo a passo contando ruas e casas", () => {
  const passos = (n: number) => rotaAte(n)!.passos;

  it("rua de baixo: casas contadas à direita a partir da esquina da portaria", () => {
    expect(passos(6)).toEqual([expect.stringMatching(/portaria/), "Ao chegar na rua de baixo, vire à direita.", "A casa 6 é a 1ª casa à direita."]);
    expect(passos(20).at(-1)).toBe("A casa 20 é a 15ª casa à direita."); // 6, 7, ..., 20
    expect(passos(43).at(-1)).toBe("A casa 43 é a 38ª casa à direita.");
  });

  it("conta as ruas do lado da curva e as casas do lado da casa", () => {
    expect(passos(140)).toContain("Pegue a 4ª rua à esquerda (rua entre as quadras).");
    expect(passos(140).at(-1)).toBe("A casa 140 é a 2ª casa à esquerda."); // a 139 vem antes
    expect(passos(152).at(-1)).toBe("A casa 152 é a 11ª casa à direita."); // de 162 subindo até 152
  });

  it("rua do muro (mão única descendo): conta de cima para baixo", () => {
    expect(passos(206).at(-1)).toBe("A casa 206 é a 1ª casa à direita.");
    expect(passos(200).at(-1)).toBe("A casa 200 é a 7ª casa à direita.");
    expect(passos(200)).toContain("No fim da rua, vire à esquerda (rua junto ao muro).");
  });

  it("toda casa termina com a posição dela na rua", () => {
    for (let n = 1; n <= TOTAL_LOTES; n++) {
      expect(passos(n).at(-1), `casa ${n}`).toMatch(new RegExp(`^A casa ${n} é a [0-9]+ª casa à (direita|esquerda)[.]$`));
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
