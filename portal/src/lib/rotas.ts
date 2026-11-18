/**
 * COMO CHEGAR: ruas do condomínio e o caminho mais curto da PORTARIA
 * (entrada embaixo, à esquerda) até qualquer casa.
 *
 * As ruas são o "esqueleto" do desenho da planta (src/lib/planta.ts): cada
 * ponto é um cruzamento ou curva, no meio da rua, nas mesmas coordenadas do
 * desenho. A casa se liga ao ponto da rua mais perto da frente dela.
 * O caminho é calculado pelo algoritmo de Dijkstra (o menor percurso)
 * RESPEITANDO A MÃO DE CADA RUA: o sentido vem do projeto oficial de
 * sinalização viária (docs/sinalizacao-viaria-rv00.pdf). O PDF está girado
 * 180° em relação ao nosso desenho (lá a portaria fica no alto, à direita).
 */
import { LOTES, loteDoNumero, type Lote } from "./planta";

type Ponto = [number, number];

/** Cruzamentos e curvas das ruas (centro da rua). */
const PONTOS: Record<string, Ponto> = {
  // Portaria: no meio há um canteiro. Quem ENTRA sobe RETO pela faixa da direita
  // (x = 324); quem SAI desce RETO pela faixa do outro lado (x = 268).
  portao: [324, 965],
  guarita: [324, 905],
  canteiroEntrada: [324, 858],
  entradaRua: [324, 799],
  saidaRua: [268, 799],
  canteiroSaida: [268, 858],
  guaritaSaida: [268, 905],
  portaoSaida: [268, 965],

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

  // Topo. A avenida da portaria (x = 296) sobe RETA até o alto: entre as quadras,
  // depois entre a APP e o parque, depois ao lado do parquinho; no alto contorna a
  // quadra do topo e desce pela rua do muro. (Em volta do parquinho e dos quiosques
  // só há trilhas de pedestre: não é rua de carro.)
  t168baixo: [168, 289],
  t296: [296, 289],
  t168alto: [168, -60],
  t296alto: [296, 30],
  t296parque: [296, 209],
};

/** Pontos das faixas da guarita (contornam o canteiro): não são esquina nem frente de casa. */
const DA_PORTARIA = new Set(["portao", "guarita", "canteiroEntrada", "canteiroSaida", "guaritaSaida", "portaoSaida"]);

/** "unica": só se anda de A para B. "dupla": nos dois sentidos. */
type Mao = "unica" | "dupla";

/**
 * Trechos de rua [A, B, mão]. Nos de mão única, a ordem A → B É o sentido do
 * trânsito (conferido seta por seta no PDF da sinalização). O circuito:
 * entra pela portaria → rua de baixo para a direita → sobe pelas ruas entre as
 * quadras → volta pela diagonal e pela rua em frente ao parque → desce pela
 * avenida até a portaria (saída).
 */
const TRECHOS: [string, string, Mao][] = [
  // entrada: faixa da direita de quem entra ("ENTRADA"), contornando o canteiro, até a rua de baixo
  ["portao", "guarita", "unica"],
  ["guarita", "canteiroEntrada", "unica"],
  ["canteiroEntrada", "entradaRua", "unica"],
  // saída: da rua de baixo, desce reto pela faixa do outro lado do canteiro ("SAÍDA").
  // Quem vem descendo a avenida (x = 296) entra na faixa de saída dentro do próprio cruzamento.
  ["saidaRua", "canteiroSaida", "unica"],
  ["b296", "saidaRua", "unica"],
  ["canteiroSaida", "guaritaSaida", "unica"],
  ["guaritaSaida", "portaoSaida", "unica"],
  // rua de baixo: mão única para a direita (o pedacinho junto ao muro é mão dupla)
  ["b100", "b172", "dupla"],
  ["b172", "saidaRua", "unica"],
  ["saidaRua", "b296", "unica"],
  ["b296", "entradaRua", "unica"],
  ["entradaRua", "b420", "unica"],
  ["b420", "b538", "unica"],
  ["b538", "b652", "unica"],
  ["b652", "b764", "unica"],
  ["b764", "b882", "unica"],
  ["b882", "b1001", "unica"],
  ["b1001", "b1120", "unica"],
  ["b1120", "b1236", "unica"],
  // ruas entre as quadras à direita da avenida: SOBEM (saem da rua de baixo)
  ["b420", "c420", "unica"],
  ["b538", "c538", "unica"],
  ["b652", "c652", "unica"],
  ["b764", "d764", "unica"],
  ["b882", "d882", "unica"],
  ["b1001", "d1001", "unica"],
  ["b1120", "d1120", "unica"],
  ["b1236", "d1236", "unica"],
  // diagonal: para a esquerda, até a rua ao lado do parque, que desce
  ["d1236", "d1120", "unica"],
  ["d1120", "d1001", "unica"],
  ["d1001", "d882", "unica"],
  ["d882", "d796", "unica"],
  ["d796", "d764", "unica"],
  ["d764", "d652", "unica"],
  ["d652", "c652", "unica"],
  // rua em frente ao parque: para a esquerda, até a avenida e a rua das casas 44–71
  ["c652", "c538", "unica"],
  ["c538", "c420", "unica"],
  ["c420", "c296", "unica"],
  ["c296", "c172", "unica"],
  // descidas até a rua de baixo (saída): avenida e rua entre as casas 44–53 e 54–71
  ["c296", "b296", "unica"],
  ["c172", "b172", "unica"],
  // avenida entre a APP e o parque e rua acima da APP: mão dupla
  ["c296", "t296", "dupla"],
  ["t168baixo", "t296", "dupla"],
  // alto: sobe ao lado do parquinho, contorna a quadra do topo e desce pela rua do muro
  ["t296", "t296parque", "unica"],
  ["t296parque", "t296alto", "unica"],
  ["t296alto", "t168alto", "unica"],
  ["t168alto", "t168baixo", "unica"],
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
export function frenteDaCasa(lote: Lote): { ponto: Ponto; trecho: [string, string]; mao: Mao } {
  const centro: Ponto = [lote.x + lote.w / 2, lote.y + lote.h / 2];
  let melhor: { ponto: Ponto; dist: number; trecho: [string, string]; mao: Mao } | null = null;
  for (const [a, b, mao] of TRECHOS) {
    if (DA_PORTARIA.has(a) || DA_PORTARIA.has(b)) continue; // faixas da guarita: nenhuma casa dá de frente para elas
    const r = projetar(centro, PONTOS[a], PONTOS[b]);
    if (!melhor || r.dist < melhor.dist) melhor = { ...r, trecho: [a, b], mao };
  }
  return { ponto: melhor!.ponto, trecho: melhor!.trecho, mao: melhor!.mao };
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
  /** "chegar": da portaria até a casa. "sair": da casa até a saída da portaria. */
  tipo: "chegar" | "sair";
  /** Pontos do caminho pelas ruas (na ordem em que se anda). */
  pontos: Ponto[];
  /** Centro da casa (para a perninha tracejada entre a casa e a rua). */
  casa: Ponto;
  /** Passo a passo em palavras simples. */
  passos: string[];
  /** Nomes dos cruzamentos por onde passa ("frente" = frente da casa). Usado nos testes. */
  caminho: string[];
  /** Trecho de rua onde a casa encosta e a mão dele. */
  frente: { trecho: [string, string]; mao: Mao };
};

/** Vira à direita ou à esquerda? (no desenho, o "y" cresce para baixo) */
function sentidoDaCurva(a: Ponto, b: Ponto, c: Ponto): "direita" | "esquerda" | null {
  const v1 = [b[0] - a[0], b[1] - a[1]];
  const v2 = [c[0] - b[0], c[1] - b[1]];
  const angulo = Math.atan2(v1[0] * v2[1] - v1[1] * v2[0], v1[0] * v2[0] + v1[1] * v2[1]);
  if (Math.abs(angulo) < (25 * Math.PI) / 180) return null; // segue em frente
  return angulo > 0 ? "direita" : "esquerda";
}

/** Nome da rua de um trecho, para o passo a passo ("rua de baixo"). */
function nomeDaRua(a: string, b: string): string {
  if ([a, b].some((n) => n.endsWith("Saida") || n === "portaoSaida")) return "saída da portaria";
  if ([a, b].includes("entradaRua") || [a, b].includes("saidaRua")) return "rua de baixo";
  const [pa, pb] = [a[0], b[0]];
  if (pa === "b" && pb === "b") return "rua de baixo";
  if (pa === "c" && pb === "c") return "rua em frente ao parque";
  if (pa === "d" && pb === "d") return "rua da diagonal";
  if (a.startsWith("t168") && b.startsWith("t168")) return "rua junto ao muro";
  if ([a, b].includes("t168baixo") && [a, b].includes("t296")) return "rua acima da APP";
  if ([a, b].includes("t296alto") && [a, b].includes("t168alto")) return "rua que contorna a quadra do topo";
  if (a.includes("296") && b.includes("296")) return "avenida da portaria";
  return "rua entre as quadras";
}

type Lado = "direita" | "esquerda";

/** Ângulo (em graus, com sinal) de v1 para v2. Positivo = para a direita (o "y" cresce para baixo). */
function angulo(v1: Ponto, v2: Ponto): number {
  return (Math.atan2(v1[0] * v2[1] - v1[1] * v2[0], v1[0] * v2[0] + v1[1] * v2[1]) * 180) / Math.PI;
}
const vetor = (a: Ponto, b: Ponto): Ponto => [b[0] - a[0], b[1] - a[1]];

/**
 * Ruas que saem de um cruzamento, vistas por quem chega nele vindo de `de`:
 * quantas ficam à direita, à esquerda e se dá para seguir reto. Conta TODAS as
 * ruas que a pessoa vê (inclusive as de mão contrária), porque é assim que se
 * conta "a 3ª rua à direita".
 */
function ruasNoCruzamento(no: string, de: Ponto): { direita: Ponto[]; esquerda: Ponto[]; reto: boolean } {
  const aqui = PONTOS[no];
  const chegada = vetor(de, aqui);
  const r = { direita: [] as Ponto[], esquerda: [] as Ponto[], reto: false };
  for (const [a, b] of TRECHOS) {
    if (a !== no && b !== no) continue;
    const outro = PONTOS[a === no ? b : a];
    const saida = vetor(aqui, outro);
    const g = angulo(chegada, saida);
    if (Math.abs(g) > 160) continue; // é a rua de onde a pessoa veio
    if (Math.abs(g) < 25) r.reto = true;
    else (g > 0 ? r.direita : r.esquerda).push(outro);
  }
  return r;
}

/**
 * Posição da casa na última rua do caminho: "a 6ª casa à direita".
 * Conta, do ponto em que a pessoa entrou nessa rua até a casa, só as casas do
 * MESMO lado e que dão de frente para esta rua.
 */
function posicaoNaRua(numero: number, pernaOriginal: Ponto[], lado: Lado): number {
  // A rua continua antes e depois do trecho percorrido: prolonga a reta para os dois
  // lados, senão uma casa que fica DEPOIS da procurada seria "achatada" em cima dela.
  const longe = 5000;
  const [p0, p1] = [pernaOriginal[0], pernaOriginal[1] ?? pernaOriginal[0]];
  const [q1, q0] = [pernaOriginal.at(-1)!, pernaOriginal.at(-2) ?? pernaOriginal.at(-1)!];
  const unitario = (v: Ponto): Ponto => {
    const n = Math.hypot(v[0], v[1]) || 1;
    return [v[0] / n, v[1] / n];
  };
  const [ui, uf] = [unitario(vetor(p0, p1)), unitario(vetor(q0, q1))];
  const perna: Ponto[] = [
    [p0[0] - ui[0] * longe, p0[1] - ui[1] * longe],
    ...pernaOriginal,
    [q1[0] + uf[0] * longe, q1[1] + uf[1] * longe],
  ];
  // Distância percorrida até o ponto da rua mais perto de p, de que lado p fica e a que distância da rua.
  const aoLongo = (p: Ponto): { s: number; lado: Lado | null; dist: number } => {
    let melhor = { dist: Infinity, s: 0, lado: null as Lado | null };
    let acumulado = 0;
    for (let k = 1; k < perna.length; k++) {
      const [a, b] = [perna[k - 1], perna[k]];
      const pr = projetar(p, a, b);
      if (pr.dist < melhor.dist) {
        const g = angulo(vetor(a, b), vetor(pr.ponto, p));
        melhor = { dist: pr.dist, s: acumulado + distancia(a, pr.ponto), lado: Math.abs(g) < 1 ? null : g > 0 ? "direita" : "esquerda" };
      }
      acumulado += distancia(a, b);
    }
    return melhor;
  };
  const centro = (l: Lote): Ponto => [l.x + l.w / 2, l.y + l.h / 2];
  const sInicio = longe; // onde a pessoa entrou na rua (a perna começa "longe" antes)
  const sAlvo = aoLongo(centro(loteDoNumero(numero)!)).s;
  // Conta o que a pessoa vê: casas ENCOSTADAS nesta rua, do lado certo, entre a
  // esquina onde entrou e a casa procurada (inclusive).
  let posicao = 0;
  for (const l of LOTES) {
    const r = aoLongo(centro(l));
    if (r.lado !== lado || r.s < sInicio - 5 || r.s > sAlvo + 0.5) continue;
    // A BORDA do lote precisa encostar na rua (o canto mais perto do meio da rua).
    const cantos: Ponto[] = [
      [l.x, l.y],
      [l.x + l.w, l.y],
      [l.x, l.y + l.h],
      [l.x + l.w, l.y + l.h],
    ];
    const borda = Math.min(...cantos.map((c) => aoLongo(c).dist));
    if (borda <= ENCOSTADA_NA_RUA || l.numero === numero) posicao++;
  }
  return Math.max(1, posicao);
}

/** Até que distância do meio da rua a borda de uma casa ainda "encosta" nela (meia rua + calçada). */
const ENCOSTADA_NA_RUA = 28;

/** Grafo das ruas (só no sentido permitido) com o ponto "frente" da casa no meio do trecho dela. */
function grafoComCasa(frente: ReturnType<typeof frenteDaCasa>) {
  const vizinhos = new Map<string, { para: string; custo: number }[]>();
  const ligar = (a: string, b: string, pa: Ponto, pb: Ponto, mao: Mao) => {
    const c = distancia(pa, pb);
    vizinhos.set(a, [...(vizinhos.get(a) ?? []), { para: b, custo: c }]);
    if (mao === "dupla") vizinhos.set(b, [...(vizinhos.get(b) ?? []), { para: a, custo: c }]);
  };
  const [ta, tb] = frente.trecho;
  for (const [a, b, mao] of TRECHOS) {
    if (a === ta && b === tb) continue;
    ligar(a, b, PONTOS[a], PONTOS[b], mao);
  }
  ligar(ta, "frente", PONTOS[ta], frente.ponto, frente.mao);
  ligar("frente", tb, frente.ponto, PONTOS[tb], frente.mao);
  return vizinhos;
}

/**
 * Curvas do caminho em palavras: "Ao chegar na rua de baixo, vire à direita",
 * "Pegue a 3ª rua à esquerda", "No fim da rua, vire à esquerda".
 * Devolve também onde começa a última rua (para contar as casas nela).
 */
function descreverCurvas(nomes: string[], pontos: Ponto[], frente: ReturnType<typeof frenteDaCasa>) {
  const passos: string[] = [];
  const trechoDe = (i: number): [string, string] =>
    nomes[i] === "frente" || nomes[i + 1] === "frente" ? frente.trecho : [nomes[i], nomes[i + 1]];
  let inicioDaRua = 0; // índice do ponto onde a pessoa entrou na rua atual
  for (let i = 1; i < pontos.length - 1; i++) {
    if (DA_PORTARIA.has(nomes[i])) continue; // contornar o canteiro da guarita não é "virar"
    // Quem desce a avenida passa para a faixa de saída dentro do próprio cruzamento: segue em frente.
    if ((nomes[i] === "b296" && nomes[i + 1] === "saidaRua") || (nomes[i] === "saidaRua" && nomes[i - 1] === "b296")) continue;
    const g = angulo(vetor(pontos[i - 1], pontos[i]), vetor(pontos[i], pontos[i + 1]));
    if (Math.abs(g) < 25) continue; // segue em frente
    const lado: Lado = g > 0 ? "direita" : "esquerda";
    // Conta as ruas do lado da curva desde a última curva (inclusive a desta esquina).
    let ordem = 0;
    let temReto = true;
    for (let k = inicioDaRua + 1; k <= i; k++) {
      if (nomes[k] === "frente") continue;
      const ruas = ruasNoCruzamento(nomes[k], pontos[k - 1]);
      ordem += ruas[lado].length;
      if (k === i) temReto = ruas.reto;
    }
    const nome = nomeDaRua(...trechoDe(i));
    passos.push(
      inicioDaRua === 0
        ? `Ao chegar na ${nome}, vire à ${lado}.`
        : !temReto
          ? `No fim da rua, vire à ${lado} (${nome}).`
          : `Pegue a ${Math.max(1, ordem)}ª rua à ${lado} (${nome}).`,
    );
    inicioDaRua = i;
  }
  return { passos, inicioDaRua };
}

/** Caminho da portaria até a casa. null se o número não existir. */
export function rotaAte(numero: number): Rota | null {
  const lote = loteDoNumero(numero);
  if (!lote) return null;
  const frente = frenteDaCasa(lote);
  const nomes = menorCaminho(grafoComCasa(frente), "portao", "frente");
  if (!nomes.length) return null;
  const pontos = nomes.map((n) => (n === "frente" ? frente.ponto : PONTOS[n]));
  const casa: Ponto = [lote.x + lote.w / 2, lote.y + lote.h / 2];

  // Passo a passo como se explica para alguém, terminando com "é a 6ª casa à direita".
  const curvas = descreverCurvas(nomes, pontos, frente);
  const passos = ['Entre pela portaria (faixa da direita, "Entrada") e siga em frente.', ...curvas.passos];
  const perna = pontos.slice(curvas.inicioDaRua);
  const ladoCasa = sentidoDaCurva(pontos.at(-2) ?? pontos[0], pontos.at(-1)!, casa) ?? "direita";
  passos.push(`A casa ${numero} é a ${posicaoNaRua(numero, perna, ladoCasa)}ª casa à ${ladoCasa}.`);
  return { tipo: "chegar", pontos, casa, passos, caminho: nomes, frente: { trecho: frente.trecho, mao: frente.mao } };
}

/** Caminho da casa até a SAÍDA da portaria (respeitando a mão das ruas). null se o número não existir. */
export function rotaSaida(numero: number): Rota | null {
  const lote = loteDoNumero(numero);
  if (!lote) return null;
  const frente = frenteDaCasa(lote);
  const nomes = menorCaminho(grafoComCasa(frente), "frente", "portaoSaida");
  if (!nomes.length) return null;
  const pontos = nomes.map((n) => (n === "frente" ? frente.ponto : PONTOS[n]));
  const casa: Ponto = [lote.x + lote.w / 2, lote.y + lote.h / 2];

  const ruaDaCasa = nomeDaRua(...frente.trecho);
  const curvas = descreverCurvas(nomes, pontos, frente);
  const passos = [
    `Saindo da casa ${numero}, siga pela ${ruaDaCasa}${frente.mao === "unica" ? ", no sentido do trânsito (é mão única)" : ""}.`,
    ...curvas.passos,
    'Siga até a portaria e saia pela faixa da direita ("Saída").',
  ];
  return { tipo: "sair", pontos, casa, passos, caminho: nomes, frente: { trecho: frente.trecho, mao: frente.mao } };
}

/** Para os testes e para desenhar as ruas, se preciso. */
export const RUAS = { PONTOS, TRECHOS };
export type { Mao };
