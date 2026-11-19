/**
 * Gerador de PDF bem simples (uma página A4, texto e uma faixa colorida), sem biblioteca.
 * Usado no COMPROVANTE DE VOTAÇÃO. Fontes padrão do PDF (Helvetica), com acentos do português
 * (codificação WinAnsi). Testado em tests/unit/pdf-simples.test.ts.
 */

export type LinhaPdf = {
  texto: string;
  tamanho?: number;
  negrito?: boolean;
  /** Cor do texto em RGB 0–1. */
  cor?: [number, number, number];
  /** Espaço extra antes da linha (pontos). */
  antes?: number;
};

const LARGURA = 595;
const ALTURA = 842;
const MARGEM = 48;

/** Converte para bytes WinAnsi (Latin-1 cobre os acentos do português). */
function paraWinAnsi(t: string): string {
  const trocas: Record<string, string> = {
    "—": "-",
    "–": "-",
    "“": '"',
    "”": '"',
    "‘": "'",
    "’": "'",
    "…": "...",
    "·": "·",
    "✓": "v",
  };
  return [...t]
    .map((c) => trocas[c] ?? c)
    .map((c) => (c.charCodeAt(0) <= 0xff ? c : "?"))
    .join("");
}

const escapar = (t: string) =>
  paraWinAnsi(t)
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");

/** Quebra a linha pela largura aproximada (Helvetica ≈ 0,5 × tamanho por letra). */
function quebrar(texto: string, tamanho: number, negrito: boolean): string[] {
  const max = Math.floor(
    (LARGURA - 2 * MARGEM) / (tamanho * (negrito ? 0.56 : 0.5)),
  );
  const palavras = texto.split(/\s+/);
  const linhas: string[] = [];
  let atual = "";
  for (const p of palavras) {
    if ((atual ? `${atual} ${p}` : p).length > max && atual) {
      linhas.push(atual);
      atual = p;
    } else {
      atual = atual ? `${atual} ${p}` : p;
    }
  }
  if (atual || !linhas.length) linhas.push(atual);
  return linhas;
}

/**
 * Monta o PDF: faixa no topo com título e subtítulo, depois as linhas.
 * Devolve os bytes (Uint8Array) prontos para baixar.
 */
export function gerarPdf(o: {
  titulo: string;
  subtitulo?: string;
  corFaixa?: [number, number, number];
  linhas: LinhaPdf[];
  rodape?: string;
}): Uint8Array {
  const faixa = o.corFaixa ?? [0.114, 0.42, 0.306];
  const cmds: string[] = [];
  const cor = (c: [number, number, number]) =>
    `${c.map((x) => x.toFixed(3)).join(" ")} rg`;
  // Faixa do topo
  cmds.push(`q ${cor(faixa)} 0 ${ALTURA - 120} ${LARGURA} 120 re f Q`);
  cmds.push(
    `BT /F2 24 Tf ${cor([1, 1, 1])} ${MARGEM} ${ALTURA - 62} Td (${escapar(o.titulo)}) Tj ET`,
  );
  if (o.subtitulo)
    cmds.push(
      `BT /F1 13 Tf ${cor([0.88, 0.95, 0.9])} ${MARGEM} ${ALTURA - 90} Td (${escapar(o.subtitulo)}) Tj ET`,
    );
  let y = ALTURA - 160;
  for (const l of o.linhas) {
    const tam = l.tamanho ?? 12;
    y -= l.antes ?? 0;
    // Letras grandes sobem mais: dá um respiro para não encostar na linha de cima.
    y -= Math.max(0, tam - 10) * 0.85;
    for (const parte of quebrar(l.texto, tam, !!l.negrito)) {
      cmds.push(
        `BT /${l.negrito ? "F2" : "F1"} ${tam} Tf ${cor(l.cor ?? [0.08, 0.13, 0.11])} ${MARGEM} ${y.toFixed(1)} Td (${escapar(parte)}) Tj ET`,
      );
      y -= tam * 1.45;
    }
  }
  if (o.rodape) {
    cmds.push(
      `q 0.85 0.88 0.86 RG 0.8 w ${MARGEM} 70 m ${LARGURA - MARGEM} 70 l S Q`,
    );
    cmds.push(
      `BT /F1 9 Tf ${cor([0.37, 0.43, 0.4])} ${MARGEM} 54 Td (${escapar(o.rodape)}) Tj ET`,
    );
  }
  const conteudo = cmds.join("\n");

  const objetos = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${LARGURA} ${ALTURA}] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>",
    `<< /Length ${latin1(conteudo).length} >>\nstream\n${conteudo}\nendstream`,
  ];
  let pdf = "%PDF-1.4\n%âãÏÓ\n";
  const posicoes: number[] = [];
  objetos.forEach((obj, i) => {
    posicoes.push(latin1(pdf).length);
    pdf += `${i + 1} 0 obj\n${obj}\nendobj\n`;
  });
  const xref = latin1(pdf).length;
  pdf += `xref\n0 ${objetos.length + 1}\n0000000000 65535 f \n`;
  for (const p of posicoes) pdf += `${String(p).padStart(10, "0")} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objetos.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return latin1(pdf);
}

/** Bytes Latin-1 de um texto (cada caractere ≤ 0xFF vira 1 byte). */
function latin1(t: string): Uint8Array {
  const b = new Uint8Array(t.length);
  for (let i = 0; i < t.length; i++) b[i] = t.charCodeAt(i) & 0xff;
  return b;
}

/** Comprovante de votação (sem o voto!). */
export function pdfComprovante(c: {
  condominioNome: string;
  titulo: string;
  cargo: string;
  casa: string;
  quando: string;
  codigo: string;
  geradoEm: string;
}): Uint8Array {
  return gerarPdf({
    titulo: "Comprovante de votação",
    subtitulo: c.condominioNome,
    linhas: [
      { texto: "Eleição", tamanho: 10, cor: [0.37, 0.43, 0.4] },
      { texto: c.titulo, tamanho: 16, negrito: true },
      { texto: c.cargo, tamanho: 12 },
      { texto: "Casa", tamanho: 10, cor: [0.37, 0.43, 0.4], antes: 14 },
      { texto: c.casa, tamanho: 16, negrito: true },
      {
        texto: "Data e hora do voto",
        tamanho: 10,
        cor: [0.37, 0.43, 0.4],
        antes: 14,
      },
      { texto: c.quando, tamanho: 14, negrito: true },
      {
        texto: "Código do comprovante",
        tamanho: 10,
        cor: [0.37, 0.43, 0.4],
        antes: 14,
      },
      {
        texto: c.codigo,
        tamanho: 20,
        negrito: true,
        cor: [0.114, 0.42, 0.306],
      },
      {
        texto:
          "Este comprovante confirma que a casa acima votou nesta eleição.",
        tamanho: 12,
        antes: 26,
      },
      {
        texto:
          "Ele NÃO mostra em quem a casa votou: o voto é secreto. O portal guarda só que a casa votou e a soma dos votos — nem a comissão nem o síndico conseguem ver o voto de uma casa.",
        tamanho: 11,
        cor: [0.24, 0.31, 0.27],
        antes: 4,
      },
    ],
    rodape: `Portal do condomínio · gerado em ${c.geradoEm}`,
  });
}
