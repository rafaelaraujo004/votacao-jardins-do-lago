import { inflateRawSync } from "node:zlib";

/**
 * Lê as TABELAS de um arquivo .docx (Word) sem biblioteca extra.
 * O .docx é um arquivo zip; aqui só abrimos o "word/document.xml" e pegamos
 * o texto de cada célula. Cada tabela vira uma lista de linhas (lista de células).
 * Limites de segurança: arquivo até 4 MB e documento descompactado até 20 MB.
 */
const LIMITE_ARQUIVO = 4 * 1024 * 1024;
const LIMITE_XML = 20 * 1024 * 1024;

export class ErroDocx extends Error {}

function lerEntradaZip(zip: Buffer, nome: string): Buffer {
  // Fim do diretório central (assinatura 0x06054b50), procurado do fim para o começo.
  let eocd = -1;
  for (let i = zip.length - 22; i >= Math.max(0, zip.length - 65557); i--) {
    if (zip.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new ErroDocx("O arquivo não parece ser um .docx válido.");
  const total = zip.readUInt16LE(eocd + 10);
  let p = zip.readUInt32LE(eocd + 16);
  for (let n = 0; n < total; n++) {
    if (p + 46 > zip.length || zip.readUInt32LE(p) !== 0x02014b50)
      throw new ErroDocx("O arquivo .docx está corrompido.");
    const metodo = zip.readUInt16LE(p + 10);
    const tamComprimido = zip.readUInt32LE(p + 20);
    const tamReal = zip.readUInt32LE(p + 24);
    const lenNome = zip.readUInt16LE(p + 28);
    const lenExtra = zip.readUInt16LE(p + 30);
    const lenComent = zip.readUInt16LE(p + 32);
    const local = zip.readUInt32LE(p + 42);
    const nomeEntrada = zip.toString("utf8", p + 46, p + 46 + lenNome);
    if (nomeEntrada === nome) {
      if (tamReal > LIMITE_XML)
        throw new ErroDocx("O documento é grande demais.");
      if (local + 30 > zip.length || zip.readUInt32LE(local) !== 0x04034b50)
        throw new ErroDocx("O arquivo .docx está corrompido.");
      const inicio =
        local +
        30 +
        zip.readUInt16LE(local + 26) +
        zip.readUInt16LE(local + 28);
      if (inicio + tamComprimido > zip.length)
        throw new ErroDocx("O arquivo .docx está corrompido.");
      const dados = zip.subarray(inicio, inicio + tamComprimido);
      if (metodo === 0) return Buffer.from(dados);
      if (metodo === 8) {
        try {
          return inflateRawSync(dados, { maxOutputLength: LIMITE_XML });
        } catch {
          throw new ErroDocx(
            "Não consegui abrir o .docx (arquivo corrompido ou grande demais).",
          );
        }
      }
      throw new ErroDocx("Formato de compressão do .docx não suportado.");
    }
    p += 46 + lenNome + lenExtra + lenComent;
  }
  throw new ErroDocx("Não encontrei o texto do documento dentro do .docx.");
}

const entidades: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
};
const decodificar = (t: string) =>
  t.replace(/&(#x?[0-9a-fA-F]+|\w+);/g, (m, e: string) =>
    e[0] === "#"
      ? String.fromCodePoint(
          e[1] === "x" ? parseInt(e.slice(2), 16) : Number(e.slice(1)),
        )
      : (entidades[e] ?? m),
  );

/** Texto de um trecho de XML do Word: junta os <w:t>, com espaço entre parágrafos e quebras. */
function textoDe(xml: string): string {
  const partes: string[] = [];
  for (const par of xml.split(/<\/w:p>/)) {
    const t = [
      ...par.matchAll(
        /<w:t(?:\s[^<>]*)?>([^<]*)<\/w:t>|<w:(?:br|tab|cr)\b[^<>]*\/>/g,
      ),
    ]
      .map((m) => (m[1] !== undefined ? decodificar(m[1]) : " | "))
      .join("");
    if (t.trim()) partes.push(t.trim());
  }
  return partes
    .join(" | ")
    .replace(/[ \t]+/g, " ")
    .trim();
}

/** Tabelas do .docx: tabela → linhas → células (texto). Tabelas dentro de tabelas são achatadas. */
export function lerTabelasDocx(arquivo: Buffer): string[][][] {
  if (arquivo.length > LIMITE_ARQUIVO)
    throw new ErroDocx("O arquivo passa de 4 MB.");
  const xml = lerEntradaZip(arquivo, "word/document.xml").toString("utf8");
  const tabelas: string[][][] = [];
  for (const tbl of xml.split(/<w:tbl>/).slice(1)) {
    const corpo = tbl.split(/<\/w:tbl>/)[0];
    const linhas: string[][] = [];
    for (const tr of corpo.split(/<w:tr[\s>]/).slice(1)) {
      const celulas = tr
        .split(/<w:tc[\s>]/)
        .slice(1)
        .map((tc) => textoDe(tc.split(/<\/w:tc>/)[0]));
      if (celulas.length) linhas.push(celulas);
    }
    if (linhas.length) tabelas.push(linhas);
  }
  if (!tabelas.length)
    throw new ErroDocx(
      "O documento não tem tabela. Use a lista com as colunas CASA, NOME e CONTATOS.",
    );
  return tabelas;
}
