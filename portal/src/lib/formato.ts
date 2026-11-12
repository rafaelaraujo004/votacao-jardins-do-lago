/**
 * Formatos brasileiros usados em todo o portal.
 * Os servidores da Vercel rodam em UTC: por isso TODA data passa por aqui,
 * sempre no fuso do condomínio (America/Belem, UTC-3, sem horário de verão).
 */

export const FUSO_PADRAO = "America/Belem";

const moeda = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

/** 123456 centavos → "R$ 1.234,56". Dinheiro é sempre guardado em centavos inteiros. */
export function formatarMoeda(centavos: number): string {
  if (!Number.isSafeInteger(centavos)) {
    throw new Error("Valor em centavos precisa ser um número inteiro.");
  }
  return moeda.format(centavos / 100);
}

/** "1.234,56", "1234,5", "R$ 10" → centavos. Retorna null se não for um valor válido. */
export function reaisParaCentavos(texto: string): number | null {
  const limpo = texto.replace(/R\$/gi, "").replace(/\s/g, "");
  if (!/^-?\d{1,3}(\.\d{3})*(,\d{1,2})?$|^-?\d+(,\d{1,2})?$/.test(limpo)) return null;
  const negativo = limpo.startsWith("-");
  const [inteiro, decimal = ""] = limpo.replace("-", "").replace(/\./g, "").split(",");
  const centavos = Number(inteiro) * 100 + Number(decimal.padEnd(2, "0"));
  if (!Number.isSafeInteger(centavos)) return null;
  return negativo ? -centavos : centavos;
}

function partes(data: Date, fuso: string) {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: fuso,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const p = Object.fromEntries(fmt.formatToParts(data).map((x) => [x.type, x.value]));
  return { ano: p.year, mes: p.month, dia: p.day, hora: p.hour, minuto: p.minute };
}

/** Data → "DD/MM/AAAA" no fuso do condomínio. */
export function formatarData(data: Date, fuso = FUSO_PADRAO): string {
  const { ano, mes, dia } = partes(data, fuso);
  return `${dia}/${mes}/${ano}`;
}

/** Data → "DD/MM/AAAA às HH:MM" no fuso do condomínio. */
export function formatarDataHora(data: Date, fuso = FUSO_PADRAO): string {
  const { ano, mes, dia, hora, minuto } = partes(data, fuso);
  return `${dia}/${mes}/${ano} às ${hora}:${minuto}`;
}

/** Dia de hoje no fuso do condomínio, no formato guardado no banco: "AAAA-MM-DD". */
export function hojeISO(agora = new Date(), fuso = FUSO_PADRAO): string {
  const { ano, mes, dia } = partes(agora, fuso);
  return `${ano}-${mes}-${dia}`;
}

/** "2026-11-11" → "11/11/2026". */
export function dataISOParaBR(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) throw new Error(`Data inválida: ${iso}`);
  return `${m[3]}/${m[2]}/${m[1]}`;
}

/** "11/11/2026" → "2026-11-11"; null se a data não existir (ex.: 31/02). */
export function dataBRParaISO(br: string): string | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(br.trim());
  if (!m) return null;
  const [, dia, mes, ano] = m;
  const d = new Date(Date.UTC(Number(ano), Number(mes) - 1, Number(dia)));
  if (d.getUTCFullYear() !== Number(ano) || d.getUTCMonth() !== Number(mes) - 1 || d.getUTCDate() !== Number(dia)) {
    return null;
  }
  return `${ano}-${mes}-${dia}`;
}

/** Saudação conforme a hora no condomínio. */
export function saudacao(agora = new Date(), fuso = FUSO_PADRAO): string {
  const hora = Number(partes(agora, fuso).hora);
  if (hora < 12) return "Bom dia";
  if (hora < 18) return "Boa tarde";
  return "Boa noite";
}
