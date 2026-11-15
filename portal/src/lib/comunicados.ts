/**
 * Regras dos comunicados (sem banco): situações, ordem da lista, marca de
 * "novo", resumo do texto e a mensagem pronta para o WhatsApp.
 *
 * Texto dos comunicados é SIMPLES: só letras e quebras de linha. Nada de HTML.
 * A tela mostra o texto como texto (o React escapa tudo), nunca como código.
 */

export const STATUS_COMUNICADO = ["rascunho", "publicado", "arquivado"] as const;
export type StatusComunicado = (typeof STATUS_COMUNICADO)[number];

export const PRIORIDADES = ["normal", "urgente"] as const;
export type Prioridade = (typeof PRIORIDADES)[number];

export const ROTULO_STATUS_COMUNICADO: Record<StatusComunicado, string> = {
  rascunho: "Rascunho",
  publicado: "Publicado",
  arquivado: "Arquivado",
};

/** Por quantos dias um comunicado publicado aparece como "novo". */
export const DIAS_NOVO = 7;

/** Limites de tamanho (os mesmos no formulário e no servidor). */
export const LIMITE_TITULO = 120;
export const LIMITE_TEXTO = 5000;

/** O que a lista precisa para ordenar e marcar "novo". */
export type ItemOrdenavel = {
  fixado: boolean;
  prioridade: Prioridade;
  publicadoEm: Date | null;
};

export function ehStatusComunicado(v: unknown): v is StatusComunicado {
  return typeof v === "string" && (STATUS_COMUNICADO as readonly string[]).includes(v);
}

export function ehPrioridade(v: unknown): v is Prioridade {
  return typeof v === "string" && (PRIORIDADES as readonly string[]).includes(v);
}

/** true se foi publicado há menos de 7 dias (e não está no futuro por erro de relógio). */
export function ehNovo(publicadoEm: Date | null, agora = new Date(), dias = DIAS_NOVO): boolean {
  if (!publicadoEm) return false;
  const diferenca = agora.getTime() - publicadoEm.getTime();
  return diferenca >= -60_000 && diferenca < dias * 24 * 60 * 60 * 1000;
}

/**
 * Ordem da lista do morador: fixados primeiro, depois urgentes, depois os
 * mais recentes. Devolve uma lista NOVA (não mexe na original).
 */
export function ordenarParaMorador<T extends ItemOrdenavel>(lista: readonly T[]): T[] {
  const tempo = (d: Date | null) => d?.getTime() ?? 0;
  return [...lista].sort(
    (a, b) =>
      Number(b.fixado) - Number(a.fixado) ||
      Number(b.prioridade === "urgente") - Number(a.prioridade === "urgente") ||
      tempo(b.publicadoEm) - tempo(a.publicadoEm),
  );
}

/** Os poucos comunicados do Início: os primeiros da ordem do morador. */
export function destaquesDoInicio<T extends ItemOrdenavel>(lista: readonly T[], quantos = 3): T[] {
  return ordenarParaMorador(lista).slice(0, quantos);
}

/**
 * Limpa o texto digitado:
 * - troca as quebras de linha do Windows (\r\n) por \n;
 * - tira caracteres invisíveis de controle (menos a quebra de linha e o Tab);
 * - tira espaços no fim de cada linha e no começo/fim do texto;
 * - no máximo uma linha em branco seguida.
 */
export function limparTexto(texto: string): string {
  return texto
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F​-‏‪-‮⁦-⁩]/g, "")
    .replace(/\t/g, "  ")
    .split("\n")
    .map((linha) => linha.replace(/\s+$/u, ""))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Título: uma linha só, espaços repetidos viram um. */
export function limparTitulo(titulo: string): string {
  return limparTexto(titulo).replace(/\s+/gu, " ").trim();
}

/** Resumo curto (para a lista e o WhatsApp): uma linha, cortada numa palavra inteira. */
export function resumir(texto: string, maximo = 160): string {
  const corrido = texto.replace(/\s+/gu, " ").trim();
  if (corrido.length <= maximo) return corrido;
  const corte = corrido.slice(0, maximo);
  const ultimoEspaco = corte.lastIndexOf(" ");
  const base = ultimoEspaco > maximo * 0.6 ? corte.slice(0, ultimoEspaco) : corte;
  return `${base.replace(/[\s.,;:!?-]+$/u, "")}…`;
}

/** Parágrafos do texto (separados por linha em branco). Cada um mantém as quebras simples. */
export function paragrafos(texto: string): string[] {
  return texto
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
}

/** Endereço do comunicado no portal (o morador precisa entrar para ler). */
export function linkDoComunicado(base: string, id: string): string {
  return `${base.replace(/\/+$/, "")}/comunicados/${encodeURIComponent(id)}`;
}

/**
 * Mensagem pronta para o síndico mandar no grupo do WhatsApp.
 * Usa *negrito* do WhatsApp no título. Só o resumo vai na mensagem:
 * o texto completo fica no portal, que exige login.
 */
export function mensagemWhatsApp(
  c: { titulo: string; texto: string; prioridade: Prioridade },
  link: string,
  condominioNome?: string,
): string {
  const linhas = [
    c.prioridade === "urgente" ? "*URGENTE*" : null,
    `*${c.titulo.replace(/\*/g, "")}*`,
    "",
    resumir(c.texto, 280),
    "",
    `Leia o comunicado completo no portal${condominioNome ? ` do ${condominioNome}` : ""}:`,
    link,
  ];
  return linhas.filter((l) => l !== null).join("\n");
}

/** Link do WhatsApp que abre a conversa com o texto já escrito (a pessoa escolhe o grupo). */
export function linkCompartilharWhatsApp(mensagem: string): string {
  return `https://wa.me/?text=${encodeURIComponent(mensagem)}`;
}

/** Mudanças rápidas de situação feitas pela lista ou pela página do comunicado. */
export const MUDANCAS = ["publicar", "arquivar", "fixar", "desafixar"] as const;
export type Mudanca = (typeof MUDANCAS)[number];

/**
 * Confere se a mudança faz sentido para a situação atual.
 * Retorna a mensagem de erro (para a pessoa ler) ou null se pode.
 */
export function conferirMudanca(
  atual: { status: StatusComunicado; fixado: boolean },
  mudanca: Mudanca,
): string | null {
  switch (mudanca) {
    case "publicar":
      return atual.status === "publicado" ? "Este comunicado já está publicado." : null;
    case "arquivar":
      return atual.status === "arquivado" ? "Este comunicado já está arquivado." : null;
    case "fixar":
      if (atual.status !== "publicado") return "Só dá para fixar um comunicado publicado.";
      return atual.fixado ? "Este comunicado já está fixado no topo." : null;
    case "desafixar":
      return atual.fixado ? null : "Este comunicado não está fixado.";
  }
}

/** Situação final depois da mudança (só "publicar" e "arquivar" mudam a situação). */
export function statusDepois(atual: StatusComunicado, mudanca: Mudanca): StatusComunicado {
  if (mudanca === "publicar") return "publicado";
  if (mudanca === "arquivar") return "arquivado";
  return atual;
}
