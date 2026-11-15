/**
 * PLANTA REAL do Residencial Jardins do Lago (225 lotes).
 *
 * Desenhada a partir da foto da planta oficial e conferida lote a lote pelo
 * dono do projeto em 15/11/2026 (veja docs/MAPA-LOTES.md).
 *
 * As coordenadas seguem a própria foto (em pixels), por isso as quadras ficam
 * nas mesmas posições relativas da planta. O desenho não tem escala.
 *
 * Padrão das quadras de duas colunas ("U"): a numeração começa no alto da
 * coluna da esquerda, desce, passa para a coluna da direita embaixo e sobe.
 */

export type Lote = {
  numero: number;
  x: number;
  y: number;
  w: number;
  h: number;
  /** Onde fica, em palavras (aparece no cartão da casa encontrada). */
  trecho: string;
};

export type Quadra = {
  id: string;
  trecho: string;
  /** Contorno da quadra (polígono), em coordenadas do desenho. */
  contorno: [number, number][];
  lotes: Lote[];
};

export const TOTAL_LOTES = 225;

/** Área total do desenho (viewBox do SVG). */
export const AREA_DESENHO = { x: 90, y: -80, w: 1170, h: 1080 };

/** Contorno do terreno (o resto do desenho fica do lado de fora). */
export const CONTORNO_TERRENO: [number, number][] = [
  [100, -70],
  [225, -70],
  [1245, 705],
  [1245, 895],
  [345, 895],
  [345, 905],
  [250, 905],
  [250, 895],
  [100, 895],
];

function retangulo(x: number, y: number, w: number, h: number): [number, number][] {
  return [
    [x, y],
    [x + w, y],
    [x + w, y + h],
    [x, y + h],
  ];
}

/** Lotes lado a lado (da esquerda para a direita), numerados em sequência. */
function fileiraHorizontal(x: number, y: number, w: number, h: number, primeiro: number, qtd: number, trecho: string): Lote[] {
  const lw = w / qtd;
  return Array.from({ length: qtd }, (_, i) => ({ numero: primeiro + i, x: x + i * lw, y, w: lw, h, trecho }));
}

/** Lotes empilhados numa coluna. `sobe`: o primeiro número fica embaixo. */
function coluna(x: number, y: number, w: number, h: number, primeiro: number, qtd: number, sobe: boolean, trecho: string): Lote[] {
  const lh = h / qtd;
  return Array.from({ length: qtd }, (_, i) => ({
    numero: primeiro + i,
    x,
    y: sobe ? y + h - (i + 1) * lh : y + i * lh,
    w,
    h: lh,
    trecho,
  }));
}

/**
 * Quadra de duas colunas no padrão "U".
 * A coluna da esquerda tem `esquerda` lotes (desce a partir do alto); a da
 * direita tem `direita` lotes ocupando as linhas de baixo (sobe). Quando a
 * direita tem menos lotes, o alto dela é área verde (quadras com diagonal).
 */
function quadraU(
  id: string,
  trecho: string,
  x: number,
  y: number,
  w: number,
  h: number,
  primeiro: number,
  esquerda: number,
  direita: number,
  contorno?: [number, number][],
): Quadra {
  const linha = h / esquerda;
  const meio = w / 2;
  const lotes = [
    ...coluna(x, y, meio, h, primeiro, esquerda, false, trecho),
    ...coluna(x + meio, y + (esquerda - direita) * linha, meio, direita * linha, primeiro + esquerda, direita, true, trecho),
  ];
  return { id, trecho, contorno: contorno ?? retangulo(x - 6, y - 6, w + 12, h + 12), lotes };
}

export const QUADRAS: Quadra[] = [
  // ---------- Embaixo: entrada e rua de baixo (01–43) ----------
  {
    id: "entrada-esquerda",
    trecho: "Entrada, à esquerda da portaria",
    contorno: retangulo(114, 819, 142, 76),
    lotes: fileiraHorizontal(120, 825, 130, 64, 1, 5, "Entrada, à esquerda da portaria"),
  },
  {
    id: "entrada-direita",
    trecho: "Entrada, à direita da portaria",
    contorno: retangulo(340, 802, 161, 93),
    lotes: fileiraHorizontal(346, 808, 149, 81, 6, 7, "Entrada, à direita da portaria"),
  },
  {
    id: "rua-de-baixo",
    trecho: "Rua de baixo",
    contorno: retangulo(495, 802, 721, 64),
    lotes: fileiraHorizontal(501, 808, 709, 52, 13, 31, "Rua de baixo"),
  },

  // ---------- Quadras da esquerda (44–125) ----------
  {
    id: "ponta-esquerda",
    trecho: "Quadra da ponta esquerda",
    contorno: retangulo(104, 519, 62, 277),
    lotes: coluna(110, 525, 50, 265, 44, 10, true, "Quadra da ponta esquerda"),
  },
  quadraU("quadra-2", "2ª quadra (54 a 71)", 185, 545, 104, 243, 54, 9, 9),
  quadraU("quadra-3", "3ª quadra (72 a 89)", 310, 538, 100, 245, 72, 9, 9),
  quadraU("quadra-4", "4ª quadra (90 a 107)", 431, 535, 98, 240, 90, 9, 9),
  quadraU("quadra-5", "5ª quadra (108 a 125)", 548, 528, 96, 247, 108, 9, 9),

  // ---------- Meio e quadras triangulares (126–193) ----------
  quadraU("quadra-meio", "Quadra comprida do meio (126 a 151)", 660, 425, 92, 357, 126, 13, 13),
  quadraU("triangular-1", "1ª quadra triangular (152 a 172)", 776, 452, 92, 314, 152, 11, 10, [
    [770, 418],
    [800, 418],
    [874, 474],
    [874, 772],
    [770, 772],
  ]),
  quadraU("triangular-2", "2ª quadra triangular (173 a 185)", 896, 530, 90, 234, 173, 7, 6, [
    [890, 500],
    [910, 500],
    [992, 562],
    [992, 770],
    [890, 770],
  ]),
  quadraU("triangular-3", "3ª quadra triangular (186 a 192)", 1016, 624, 90, 140, 186, 4, 3, [
    [1010, 595],
    [1030, 595],
    [1112, 657],
    [1112, 770],
    [1010, 770],
  ]),
  {
    id: "ponta-direita",
    trecho: "Ponta do terreno",
    contorno: [
      [1128, 680],
      [1150, 680],
      [1222, 735],
      [1222, 770],
      [1128, 770],
    ],
    lotes: [{ numero: 193, x: 1134, y: 712, w: 70, h: 52, trecho: "Ponta do terreno" }],
  },

  // ---------- Topo, perto do parque (194–225) ----------
  {
    id: "coluna-muro",
    trecho: "Coluna junto ao muro (194 a 206)",
    contorno: retangulo(104, -56, 58, 342),
    lotes: coluna(110, -50, 46, 330, 194, 13, true, "Coluna junto ao muro (194 a 206)"),
  },
  quadraU("quadra-topo", "Quadra do topo (207 a 221)", 180, 30, 96, 240, 207, 8, 7, [
    [174, -4],
    [212, -4],
    [282, 49],
    [282, 276],
    [174, 276],
  ]),
  {
    id: "parquinho",
    trecho: "Ao lado do parquinho (222 a 225)",
    contorno: retangulo(298, 84, 52, 120),
    lotes: coluna(304, 90, 40, 108, 222, 4, false, "Ao lado do parquinho (222 a 225)"),
  },
];

/** Todos os lotes, na ordem do número (índice = número − 1). */
export const LOTES: Lote[] = QUADRAS.flatMap((q) => q.lotes).sort((a, b) => a.numero - b.numero);

export function loteDoNumero(numero: number): Lote | null {
  return LOTES[numero - 1]?.numero === numero ? LOTES[numero - 1] : null;
}
