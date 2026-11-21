/**
 * Contatos dos moradores para enviar o LINK DE VOTO pelo WhatsApp.
 * Regras sem banco (testadas em tests/unit/contatos-votacao.test.ts).
 *
 * A lista vem da tabela do Word da comissão (colunas CASA, NOME, CONTATOS).
 * Os telefones vêm em formatos variados: "(91)98888-7777", "91 988887777",
 * "M (91)98888-7777 / F (91)97777-6666"... Aqui viram só dígitos com 55 na frente
 * (formato do link wa.me). Número sem DDD recebe o DDD do condomínio (94), com aviso.
 */

export const DDD_PADRAO = "94";
export const MAX_TELEFONES = 3;

/** Extrai os telefones de um texto livre. Devolve números no formato 55DDNNNNNNNNN. */
export function lerTelefones(
  texto: string,
  ddd = DDD_PADRAO,
): { telefones: string[]; avisos: string[] } {
  const telefones: string[] = [];
  const avisos: string[] = [];
  // Separa os pedaços (linhas da célula, "/", ";", ",", " - " ou espaço duplo) antes de procurar números.
  const candidatos: { bruto: string; d: string }[] = [];
  for (const pedaco of texto.split(/[|/;,\n]|\s{2,}|\s-\s/)) {
    for (const m of pedaco.matchAll(/(\(?\d{2}\)?[\s.-]*)?\d[\d\s.-]{6,}\d/g)) {
      const d = m[0].replace(/\D/g, "");
      // Dois números colados só por espaço ("94991234567 94988887777"): separa em 11 + 10/11 dígitos.
      if (d.length >= 20 && d.length <= 22) {
        const primeiro = d.length === 20 ? 10 : 11;
        candidatos.push({
          bruto: d.slice(0, primeiro),
          d: d.slice(0, primeiro),
        });
        candidatos.push({ bruto: d.slice(primeiro), d: d.slice(primeiro) });
      } else {
        candidatos.push({ bruto: m[0], d });
      }
    }
  }
  for (const c of candidatos) {
    const m = [c.bruto];
    let d = c.d;
    if (d.startsWith("55") && (d.length === 12 || d.length === 13))
      d = d.slice(2);
    if (d.startsWith("0") && (d.length === 11 || d.length === 12))
      d = d.slice(1);
    if (d.length === 8 || d.length === 9) {
      avisos.push(`telefone sem DDD (${d}): usei o DDD ${ddd}`);
      d = ddd + d;
    }
    if (d.length !== 10 && d.length !== 11) {
      avisos.push(`telefone não reconhecido (${m[0].trim()})`);
      continue;
    }
    // Celular com 8 dígitos (antigo): coloca o 9 na frente.
    if (d.length === 10 && /[6-9]/.test(d[2]))
      d = `${d.slice(0, 2)}9${d.slice(2)}`;
    const final = `55${d}`;
    if (!telefones.includes(final)) telefones.push(final);
  }
  if (telefones.length > MAX_TELEFONES) {
    avisos.push(
      `mais de ${MAX_TELEFONES} telefones: usei os ${MAX_TELEFONES} primeiros`,
    );
    telefones.length = MAX_TELEFONES;
  }
  return { telefones, avisos };
}

/** "5591988887777" → "(91) 98888-7777". */
export function formatarTelefone(t: string): string {
  const d = t.startsWith("55") ? t.slice(2) : t;
  if (d.length === 11)
    return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10)
    return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return t;
}

export type ContatoLido = {
  numeroCasa: number;
  nome: string;
  telefones: string[];
  avisos: string[];
};

/**
 * Lê as linhas da tabela (cada linha = [casa, nome, contatos]).
 * Pula o cabeçalho e linhas sem número de casa (com aviso). Casa repetida: fica a primeira.
 */
export function lerTabelaContatos(linhas: string[][]): {
  contatos: ContatoLido[];
  avisos: string[];
} {
  const contatos: ContatoLido[] = [];
  const avisos: string[] = [];
  const vistas = new Set<number>();
  for (const [i, linha] of linhas.entries()) {
    const [casaTxt = "", nomeTxt = "", contatoTxt = ""] = linha.map((c) =>
      (c ?? "").replace(/\s+/g, " ").trim(),
    );
    if (i === 0 && /casa/i.test(casaTxt) && !/\d/.test(casaTxt)) continue; // cabeçalho
    if (!casaTxt && !nomeTxt && !contatoTxt) continue;
    const grupos = casaTxt.match(/\d+/g) ?? [];
    if (grupos.length > 1) {
      avisos.push(
        `Linha ${i + 1}: a coluna CASA tem mais de um número ("${casaTxt}") — ignorada, confira na lista.`,
      );
      continue;
    }
    const numero = Number(grupos[0] ?? NaN);
    if (!Number.isInteger(numero) || numero < 1 || numero > 9999) {
      avisos.push(`Linha ${i + 1}: sem número de casa — ignorada.`);
      continue;
    }
    if (vistas.has(numero)) {
      avisos.push(`Casa ${numero}: aparece mais de uma vez — usei a primeira.`);
      continue;
    }
    vistas.add(numero);
    const lidos = lerTelefones(contatoTxt);
    const nome = nomeTxt.replace(/\s*[\\|]\s*/g, " / ").slice(0, 120);
    if (!lidos.telefones.length)
      avisos.push(`Casa ${numero}: nenhum telefone encontrado.`);
    for (const a of lidos.avisos) avisos.push(`Casa ${numero}: ${a}.`);
    contatos.push({
      numeroCasa: numero,
      nome,
      telefones: lidos.telefones,
      avisos: lidos.avisos,
    });
  }
  return {
    contatos: contatos.sort((a, b) => a.numeroCasa - b.numeroCasa),
    avisos,
  };
}

/** Número da casa a partir do cadastro (campo numero, ou os dígitos do rótulo/id). */
export function numeroDaCasa(u: {
  id: string;
  numero?: unknown;
  rotulo?: unknown;
}): number | null {
  if (
    typeof u.numero === "number" &&
    Number.isInteger(u.numero) &&
    u.numero > 0
  )
    return u.numero;
  for (const t of [u.rotulo, u.id]) {
    const m = typeof t === "string" ? /(\d{1,4})/.exec(t) : null;
    if (m) return Number(m[1]);
  }
  return null;
}

/** Primeiro nome para a saudação ("Maria das Graças / João" → "Maria"). */
export function primeiroNome(nome: string): string {
  const p = nome.split(/[\s/\\]+/).find((x) => x.length > 1) ?? "";
  return p
    ? p[0].toLocaleUpperCase("pt-BR") + p.slice(1).toLocaleLowerCase("pt-BR")
    : "";
}

/** Texto da mensagem do WhatsApp com o link de voto da casa. */
export function mensagemConvite(o: {
  nome: string;
  casa: string;
  titulo: string;
  link: string;
  senha: string;
  periodo: string;
  condominio?: string;
  modo?: "chapa" | "candidatos";
}): string {
  const ola = primeiroNome(o.nome) ? `Olá, ${primeiroNome(o.nome)}!` : "Olá!";
  return [
    `${ola} Votação oficial do ${o.condominio || "Residencial Jardins do Lago"}: ${o.titulo}.`,
    `Votação: ${o.periodo}.`,
    "",
    `COMO VOTAR (${o.casa}):`,
    "1. Toque no link abaixo.",
    `2. Digite a senha: ${o.senha} e toque em Entrar para votar.`,
    o.modo === "candidatos"
      ? "3. Escolha seu candidato e toque em Revisar meu voto."
      : "3. Escolha SIM ou NÃO para a chapa e toque em Revisar meu voto.",
    "4. Toque em Confirmar voto. Pronto! Se quiser, baixe o comprovante.",
    "",
    o.link,
    "",
    // As imagens vão logo depois, no passo 2 do envio (o link wa.me não anexa imagens).
    "Logo abaixo vão as imagens do passo a passo. No link também tem essa ajuda.",
    "",
    "Se a senha não funcionar, responda esta mensagem que a comissão ajuda.",
    "",
    "Vale UM voto por casa e o voto é secreto. Não repasse o link nem a senha para pessoas de fora da sua casa.",
  ].join("\n");
}
