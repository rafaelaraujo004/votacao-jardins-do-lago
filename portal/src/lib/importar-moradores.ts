/**
 * Trazer para "Moradores e equipe" as pessoas da LISTA DE CONTATOS (a lista do Word
 * "LISTA ASSINATURA", já guardada em contatosVotacao/{unitId}). Código puro: roda no
 * servidor e nos testes, sem banco.
 *
 * Regras, em linguagem simples:
 * - cada NOME vira uma pessoa (perfil Morador) ligada à casa da linha.
 *   "Maria / João" vira duas pessoas;
 * - telefones: o 1º telefone vai para o 1º nome, o 2º para o 2º nome. Se a linha tem
 *   um nome só, ele fica com os dois telefones (principal e outro);
 * - nomes escritos TODOS EM MAIÚSCULAS ficam no jeito normal ("Maria das Graças");
 * - anotações junto do nome saem do nome ("MARIA SILVA ALUGADA" → "Maria Silva");
 * - ninguém é repetido: cada pessoa da lista tem um identificador fixo (casa + nome), e
 *   quem já está na casa com o mesmo nome também não entra de novo;
 * - casa inativa ou que não existe no cadastro fica de fora (o síndico resolve em Unidades);
 * - morador EXCLUÍDO pelo síndico (veio da lista ou foi cadastrado à mão) não volta sozinho:
 *   a casa e o nome ficam anotados em sistema/importacaoMoradores.excluidosPorCasa; para
 *   trazer de volta, "Adicionar pessoa".
 * As pessoas entram SEM acesso: o síndico cria o usuário e a senha de cada uma depois.
 */

export type ContatoDaLista = { unitId: string; nome: string; telefones: string[] };
export type CasaDoCadastro = { id: string; rotulo: string; numero: number; status: "ativa" | "inativa" };
export type PessoaDoCadastro = { uid: string; papel: string; unitId: string | null; nome: string };

export type PessoaParaImportar = {
  uid: string;
  unitId: string;
  rotulo: string;
  numero: number;
  nome: string;
  /** Só dígitos, sem o 55 do país (ex.: "94992221384"). Vazio se a lista não tiver. */
  telefone: string;
  telefone2: string;
};

export type PlanoImportacao = {
  novos: PessoaParaImportar[];
  /** Pessoas da lista que já estão cadastradas (não entram de novo). */
  jaCadastrados: number;
  /** Pessoas da lista que o síndico excluiu depois de trazer: não voltam sozinhas. */
  excluidosAntes: number;
  /** Casas da lista que estão inativas no cadastro (números). */
  casasInativas: number[];
  /** Linhas da lista cuja casa não existe mais no cadastro. */
  casasNaoEncontradas: number;
  /** Casas ativas sem nenhuma linha na lista e sem morador cadastrado (números). */
  casasSemContato: number[];
  /** Quantas casas a lista tem. */
  casasNaLista: number;
};

/** Teto de segurança de uma importação (o condomínio tem 225 casas; a lista, até 2 nomes por casa). */
export const LIMITE_IMPORTACAO = 600;

/** Mesmo limite de nome do cadastro manual. */
const TAMANHO_NOME = 80;

/** Palavras que ficam minúsculas no meio do nome ("Maria DAS Graças" → "Maria das Graças"). */
const PARTICULAS = new Set(["da", "das", "de", "do", "dos", "e", "di", "du", "del", "van", "von"]);

/** "  MARIA   DAS GRAÇAS " → "Maria das Graças". Só mexe em nomes escritos todos em maiúsculas. */
export function nomeApresentavel(bruto: string): string {
  const limpo = bruto.replace(/\s+/gu, " ").trim();
  const temLetra = /\p{L}/u.test(limpo);
  const tudoMaiusculo = temLetra && limpo === limpo.toLocaleUpperCase("pt-BR");
  if (!tudoMaiusculo) return limpo.slice(0, TAMANHO_NOME).trim();
  const palavras = limpo.toLocaleLowerCase("pt-BR").split(" ");
  return palavras
    .map((p, i) => {
      if (i > 0 && PARTICULAS.has(p)) return p;
      // Nomes com hífen ou apóstrofo: cada parte com a primeira letra maiúscula (Ana-Clara, D'Ávila).
      return p.replace(/(^|[-'’])(\p{L})/gu, (_, sep: string, letra: string) => sep + letra.toLocaleUpperCase("pt-BR"));
    })
    .join(" ")
    .slice(0, TAMANHO_NOME)
    .trim();
}

/** Para comparar nomes: sem acentos, sem diferença de maiúsculas e espaços. */
export function normalizarNome(nome: string): string {
  return nome
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Tira anotações que a lista do Word põe junto do nome e que não são parte dele.
 * Ex.: "MARIA SILVA ALUGADA" (casa alugada) → "MARIA SILVA". A pessoa continua cadastrada
 * na casa; só o nome fica limpo.
 */
export function tirarAnotacoes(nome: string): string {
  return nome
    .replace(/[([{]?\s*\b(alugad[ao]s?)\b\s*[)\]}]?/giu, " ")
    .replace(/\s*[-–—:,]\s*$/u, "")
    .replace(/^\s*[-–—:,]\s*/u, "")
    .replace(/\s+/gu, " ")
    .trim();
}

/** "Maria das Graças / João" → ["Maria das Graças", "João"]. Partes sem nenhuma letra são ignoradas. */
export function separarNomes(nome: string): string[] {
  return nome
    .split(/\s*[/\\|;]\s*/u)
    .map((n) => n.replace(/\s+/gu, " ").trim())
    .filter((n) => /\p{L}/u.test(n));
}

/** Nome aproveitável: pelo menos 2 letras ("Zé" vale; "A" sozinho, não). */
function nomeAproveitavel(nome: string): boolean {
  return nome.replace(/[^\p{L}]/gu, "").length >= 2;
}

/** "5594992221384" → "94992221384" (o cadastro guarda o número com DDD, sem o 55). */
export function telefoneNacional(t: string): string {
  const d = t.replace(/\D/g, "");
  return (d.length === 12 || d.length === 13) && d.startsWith("55") ? d.slice(2) : d;
}

/** Telefones da pessoa na posição `indice` de uma linha com `totalNomes` nomes. */
export function telefonesDaPessoa(indice: number, totalNomes: number, telefones: readonly string[]): { telefone: string; telefone2: string } {
  const lista = telefones.map(telefoneNacional).filter((t) => t.length >= 10 && t.length <= 11);
  if (totalNomes <= 1) return { telefone: lista[0] ?? "", telefone2: lista[1] ?? "" };
  return { telefone: lista[indice] ?? "", telefone2: "" };
}

/** Resumo curto (FNV-1a de 32 bits, em hexadecimal). Só para encurtar identificadores longos. */
function resumo(texto: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < texto.length; i++) {
    h ^= texto.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

/**
 * Identificador FIXO da pessoa da lista: condomínio + casa + NOME (sem acento, maiúsculas
 * nem espaços extras). Rodar a importação de novo gera o mesmo identificador, mesmo que a
 * lista mude a ordem dos nomes, então ninguém é criado duas vezes. Inclui o condomínio
 * (users/{uid} é compartilhado por todos os condomínios). Sempre cabe em 64 caracteres.
 */
export function uidDaLista(condominioId: string, unitId: string, nome: string): string {
  const chave = resumo(normalizarNome(nome));
  const legivel = `lista-${condominioId}-${unitId}-${chave}`;
  if (legivel.length <= 64 && /^[A-Za-z0-9_-]+$/.test(legivel)) return legivel;
  return `lista-${resumo(condominioId)}${resumo(unitId)}-${chave}`;
}

/** Monta o plano: quem entra, quem já está e quais casas ficam sem ninguém. */
export function planejarImportacao(entrada: {
  condominioId: string;
  contatos: readonly ContatoDaLista[];
  casas: readonly CasaDoCadastro[];
  pessoas: readonly PessoaDoCadastro[];
  /** Moradores que o síndico excluiu: casa → nomes (já em normalizarNome). Não voltam sozinhos. */
  excluidosPorCasa?: Readonly<Record<string, readonly string[]>>;
}): PlanoImportacao {
  const casasPorId = new Map(entrada.casas.map((c) => [c.id, c]));
  const idsExistentes = new Set(entrada.pessoas.map((p) => p.uid));
  const excluidosDaCasa = (unitId: string) => new Set(entrada.excluidosPorCasa?.[unitId] ?? []);
  // Nomes dos moradores que já estão em cada casa (qualquer situação: suspenso também conta).
  const nomesPorCasa = new Map<string, Set<string>>();
  for (const p of entrada.pessoas) {
    if (p.papel !== "morador" || !p.unitId) continue;
    const s = nomesPorCasa.get(p.unitId) ?? new Set<string>();
    s.add(normalizarNome(p.nome));
    nomesPorCasa.set(p.unitId, s);
  }

  const novos: PessoaParaImportar[] = [];
  const casasInativas = new Set<number>();
  const casasDaLista = new Set<string>();
  let jaCadastrados = 0;
  let excluidosAntes = 0;
  let casasNaoEncontradas = 0;

  for (const contato of entrada.contatos) {
    const casa = casasPorId.get(contato.unitId);
    if (!casa) {
      casasNaoEncontradas++;
      continue;
    }
    casasDaLista.add(casa.id);
    if (casa.status !== "ativa") {
      casasInativas.add(casa.numero);
      continue;
    }
    // A posição de cada nome é contada na linha ORIGINAL: um nome que fica de fora não
    // passa o telefone dele para o vizinho.
    const partes = separarNomes(contato.nome);
    const aproveitaveis = partes
      .map((bruto, posicao) => ({ nome: nomeApresentavel(tirarAnotacoes(bruto)), posicao }))
      .filter((p) => nomeAproveitavel(p.nome));
    // Linha sem nome aproveitável: entra um contato com o nome da casa (o síndico corrige depois).
    const lista = aproveitaveis.length ? aproveitaveis : [{ nome: `Contato da ${casa.rotulo}`, posicao: 0 }];
    const totalNaLinha = Math.max(partes.length, 1);
    const jaNaCasa = nomesPorCasa.get(casa.id) ?? new Set<string>();
    const excluidos = excluidosDaCasa(casa.id);
    // O mesmo nome duas vezes na linha ("ANA / ANA") é uma pessoa só, com os dois telefones.
    const vistosNaLinha = new Map<string, PessoaParaImportar | null>();
    for (const { nome, posicao } of lista) {
      const chave = normalizarNome(nome);
      const tel = telefonesDaPessoa(posicao, totalNaLinha, contato.telefones);
      if (vistosNaLinha.has(chave)) {
        const mesma = vistosNaLinha.get(chave);
        if (mesma && !mesma.telefone2 && tel.telefone && tel.telefone !== mesma.telefone) mesma.telefone2 = tel.telefone;
        continue;
      }
      const uid = uidDaLista(entrada.condominioId, casa.id, nome);
      if (idsExistentes.has(uid) || jaNaCasa.has(chave)) {
        jaCadastrados++;
        vistosNaLinha.set(chave, null);
        continue;
      }
      if (excluidos.has(chave)) {
        excluidosAntes++;
        vistosNaLinha.set(chave, null);
        continue;
      }
      const pessoa: PessoaParaImportar = { uid, unitId: casa.id, rotulo: casa.rotulo, numero: casa.numero, nome, ...tel };
      novos.push(pessoa);
      vistosNaLinha.set(chave, pessoa);
      jaNaCasa.add(chave);
    }
    nomesPorCasa.set(casa.id, jaNaCasa);
  }

  const casasSemContato = entrada.casas
    .filter((c) => c.status === "ativa" && !casasDaLista.has(c.id) && !nomesPorCasa.get(c.id)?.size)
    .map((c) => c.numero)
    .sort((a, b) => a - b);

  // Pela casa; dentro da casa, na ordem da linha (a ordenação do JavaScript é estável).
  novos.sort((a, b) => a.numero - b.numero);
  return {
    novos,
    jaCadastrados,
    excluidosAntes,
    casasInativas: [...casasInativas].sort((a, b) => a - b),
    casasNaoEncontradas,
    casasSemContato,
    casasNaLista: casasDaLista.size + casasNaoEncontradas,
  };
}

/** [194, 195, 196, 197, 198, 201] → "194 a 198 e 201". */
export function faixasDeCasas(numeros: readonly number[]): string {
  const ordenados = [...new Set(numeros.filter((n) => Number.isFinite(n) && n > 0))].sort((a, b) => a - b);
  const partes: string[] = [];
  for (let i = 0; i < ordenados.length; i++) {
    let j = i;
    while (j + 1 < ordenados.length && ordenados[j + 1] === ordenados[j] + 1) j++;
    if (j - i >= 2) partes.push(`${ordenados[i]} a ${ordenados[j]}`);
    else if (j > i) partes.push(String(ordenados[i]), String(ordenados[j]));
    else partes.push(String(ordenados[i]));
    i = j;
  }
  if (partes.length <= 1) return partes[0] ?? "";
  return `${partes.slice(0, -1).join(", ")} e ${partes.at(-1)}`;
}

/** [194..198] → "Casas 194 a 198"; [12] → "Casa 12" (singular ou plural certo). */
export function rotuloCasas(numeros: readonly number[]): string {
  const quantas = new Set(numeros).size;
  return `${quantas === 1 ? "Casa" : "Casas"} ${faixasDeCasas(numeros)}`;
}
