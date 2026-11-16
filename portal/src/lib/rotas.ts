/**
 * COMO CHEGAR: ruas do condomínio e o caminho mais curto da PORTARIA
 * (entrada embaixo, à esquerda) até qualquer casa.
 *
 * As ruas são o "esqueleto" do desenho da planta (src/lib/planta.ts): cada
 * ponto é um cruzamento ou curva, no meio da rua, nas mesmas coordenadas do
 * desenho. A casa se liga ao ponto da rua mais perto da frente dela.
 * O caminho é calculado pelo algoritmo de Dijkstra (o menor percurso).
 */
import { loteDoNumero, type Lote } from "./planta";

type Ponto = [number, number];

/** Cruzamentos e curvas das ruas (centro da rua). */
const PONTOS: Record<string, Ponto> = {
  // Entrada
  portao: [296, 965],
  guarita: [296, 905],
  rotatoria: [296, 858],

  // Rua de baixo (passa em frente às casas 01 a 43). Não há rua junto ao muro da esquerda:
  // a coluna 44–53 dá para a rua da direita dela.
  b100: [104, 799],
  b172: [172, 799],
  b296: [296, 799],
  b420: [420, 799],
  b538: [538, 799],
  b652: [652, 799],
  b764: [764, 799],
  b882: [882, 799],
  b1001: [1001, 799],
  b1120: [1120, 799],
  b1236: [1236, 799],

  // Rua de cima das quadras da esquerda (em frente ao parque e à APP)
  c172: [172, 512],
  c296: [296, 512],
  c420: [420, 512],
  c538: [538, 512],
  c652: [652, 512],

  // Rua da diagonal (no alto das quadras triangulares)
  d652: [652, 410],
  d764: [764, 404],
  d796: [796, 406],
  d882: [882, 468],
  d1001: [1001, 557],
  d1120: [1120, 651],
  d1236: [1236, 740],

  // Topo, perto do parque. A avenida da portaria (x = 296) sobe RETA até o alto,
  // entre as quadras, depois entre a APP e o parque.
  t168baixo: [168, 289],
  t296: [296, 289],
  t168alto: [168, -60],
  t296alto: [296, 30],
  t296parque: [296, 209],
  t560: [560, 209],
  t652: [652, 290],
};

/** Trechos de rua (ligam dois pontos; dá para andar nos dois sentidos). */
const TRECHOS: [string, string][] = [
  // entrada → rotatória → rua de baixo
  ["portao", "guarita"],
  ["guarita", "rotatoria"],
  ["rotatoria", "b296"],
  // rua de baixo, da esquerda para a direita
  ["b100", "b172"],
  ["b172", "b296"],
  ["b296", "b420"],
  ["b420", "b538"],
  ["b538", "b652"],
  ["b652", "b764"],
  ["b764", "b882"],
  ["b882", "b1001"],
  ["b1001", "b1120"],
  ["b1120", "b1236"],
  // ruas entre as quadras da esquerda (de baixo até a rua de cima)
  ["b172", "c172"],
  ["b296", "c296"],
  ["b420", "c420"],
  ["b538", "c538"],
  ["b652", "c652"],
  // rua de cima
  ["c172", "c296"],
  ["c296", "c420"],
  ["c420", "c538"],
  ["c538", "c652"],
  // meio e quadras triangulares: ruas verticais até a diagonal
  ["c652", "d652"],
  ["b764", "d764"],
  ["b882", "d882"],
  ["b1001", "d1001"],
  ["b1120", "d1120"],
  ["b1236", "d1236"],
  // diagonal
  ["d652", "d764"],
  ["d764", "d796"],
  ["d796", "d882"],
  ["d882", "d1001"],
  ["d1001", "d1120"],
  ["d1120", "d1236"],
  // topo: subida ao lado da APP, ruas das quadras do alto e volta pelo parque
  ["c296", "t296"],
  ["t168baixo", "t296"],
  ["t168baixo", "t168alto"],
  ["t296", "t296parque"],
  ["t296parque", "t296alto"],
  ["t296parque", "t560"],
  ["t560", "t652"],
  ["t652", "d652"],
];

const distancia = (a: Ponto, b: Ponto) => Math.hypot(a[0] - b[0], a[1] - b[1]);

/** Ponto do trecho [a, b] mais perto de p (e quanto falta até ele). */
function projetar(p: Ponto, a: Ponto, b: Ponto): { ponto: Ponto; dist: number } {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy)));
  const ponto: Ponto = [a[0] + t * dx, a[1] + t * dy];
  return { ponto, dist: distancia(p, ponto) };
}

/** Onde a casa encosta na rua: o ponto de rua mais perto do centro do lote. */
export function frenteDaCasa(lote: Lote): { ponto: Ponto; trecho: [string, string] } {
  const centro: Ponto = [lote.x + lote.w / 2, lote.y + lote.h / 2];
  let melhor: { ponto: Ponto; dist: number; trecho: [string, string] } | null = null;
  for (const [a, b] of TRECHOS) {
    const r = projetar(centro, PONTOS[a], PONTOS[b]);
    if (!melhor || r.dist < melhor.dist) melhor = { ...r, trecho: [a, b] };
  }
  return { ponto: melhor!.ponto, trecho: melhor!.trecho };
}

/** Menor caminho entre dois pontos nomeados (Dijkstra; o grafo é pequeno). */
function menorCaminho(vizinhos: Map<string, { para: string; custo: number }[]>, inicio: string, fim: string): string[] {
  const custo = new Map<string, number>([[inicio, 0]]);
  const veioDe = new Map<string, string>();
  const abertos = new Set([inicio]);
  while (abertos.size) {
    let atual = "";
    for (const n of abertos) if (!atual || custo.get(n)! < custo.get(atual)!) atual = n;
    if (atual === fim) break;
    abertos.delete(atual);
    for (const { para, custo: c } of vizinhos.get(atual) ?? []) {
      const novo = custo.get(atual)! + c;
      if (novo < (custo.get(para) ?? Infinity)) {
        custo.set(para, novo);
        veioDe.set(para, atual);
        abertos.add(para);
      }
    }
  }
  const caminho = [fim];
  while (caminho[0] !== inicio) {
    const anterior = veioDe.get(caminho[0]);
    if (!anterior) return [];
    caminho.unshift(anterior);
  }
  return caminho;
}

export type Rota = {
  /** Pontos do caminho, da portaria até a frente da casa. */
  pontos: Ponto[];
  /** Centro da casa (para a última perninha, tracejada). */
  casa: Ponto;
  /** Passo a passo em palavras simples. */
  passos: string[];
};

/** Vira à direita ou à esquerda? (no desenho, o "y" cresce para baixo) */
function sentidoDaCurva(a: Ponto, b: Ponto, c: Ponto): "direita" | "esquerda" | null {
  const v1 = [b[0] - a[0], b[1] - a[1]];
  const v2 = [c[0] - b[0], c[1] - b[1]];
  const angulo = Math.atan2(v1[0] * v2[1] - v1[1] * v2[0], v1[0] * v2[0] + v1[1] * v2[1]);
  if (Math.abs(angulo) < (25 * Math.PI) / 180) return null; // segue em frente
  return angulo > 0 ? "direita" : "esquerda";
}

/** Nome da rua de um trecho, para o passo a passo ("Vire à esquerda na rua de baixo"). */
function nomeDaRua(a: string, b: string): string {
  const [pa, pb] = [a[0], b[0]];
  if (pa === "b" && pb === "b") return " na rua de baixo";
  if (pa === "c" && pb === "c") return " na rua em frente ao parque";
  if (pa === "d" && pb === "d") return " na rua da diagonal";
  if (a.startsWith("t168") && b.startsWith("t168")) return " na rua junto ao muro";
  if ([a, b].includes("t168baixo") && [a, b].includes("t296")) return " na rua acima da APP";
  if ([a, b].includes("t560") || [a, b].includes("t652")) return " na rua do parquinho";
  if (a.includes("296") && b.includes("296")) return " na avenida da portaria";
  return " na rua entre as quadras";
}

/** Caminho da portaria até a casa. null se o número não existir. */
export function rotaAte(numero: number): Rota | null {
  const lote = loteDoNumero(numero);
  if (!lote) return null;
  const frente = frenteDaCasa(lote);

  // Grafo das ruas + o ponto "frente" da casa no meio do trecho dela.
  const vizinhos = new Map<string, { para: string; custo: number }[]>();
  const ligar = (a: string, b: string, pa: Ponto, pb: Ponto) => {
    const c = distancia(pa, pb);
    vizinhos.set(a, [...(vizinhos.get(a) ?? []), { para: b, custo: c }]);
    vizinhos.set(b, [...(vizinhos.get(b) ?? []), { para: a, custo: c }]);
  };
  for (const [a, b] of TRECHOS) {
    if ((a === frente.trecho[0] && b === frente.trecho[1]) || (a === frente.trecho[1] && b === frente.trecho[0])) continue;
    ligar(a, b, PONTOS[a], PONTOS[b]);
  }
  const posicao = (n: string) => (n === "frente" ? frente.ponto : PONTOS[n]);
  ligar(frente.trecho[0], "frente", PONTOS[frente.trecho[0]], frente.ponto);
  ligar("frente", frente.trecho[1], frente.ponto, PONTOS[frente.trecho[1]]);

  const nomes = menorCaminho(vizinhos, "portao", "frente");
  if (!nomes.length) return null;
  const pontos = nomes.map(posicao);
  const casa: Ponto = [lote.x + lote.w / 2, lote.y + lote.h / 2];

  // Passo a passo: só onde a direção muda de verdade.
  const passos = ["Entre pela portaria e siga em frente, passando pela rotatória."];
  for (let i = 1; i < pontos.length - 1; i++) {
    const curva = sentidoDaCurva(pontos[i - 1], pontos[i], pontos[i + 1]);
    // Virando para a rua da própria casa: o nome vem do trecho onde a casa encosta.
    const [a, b] = nomes[i + 1] === "frente" ? frente.trecho : [nomes[i], nomes[i + 1]];
    if (curva) passos.push(`Vire à ${curva}${nomeDaRua(a, b)}.`);
  }
  const ultimo = pontos.at(-2) ?? pontos[0];
  const lado = sentidoDaCurva(ultimo, pontos.at(-1)!, casa);
  passos.push(`A casa ${numero} fica ${lado ? `à sua ${lado}` : "logo à frente"}.`);
  return { pontos, casa, passos };
}

/** Para os testes e para desenhar as ruas, se preciso. */
export const RUAS = { PONTOS, TRECHOS };
