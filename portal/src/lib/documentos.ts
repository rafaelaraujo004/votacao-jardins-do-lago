/**
 * Regras dos documentos do condomínio (sem banco).
 *
 * Por enquanto o portal NÃO guarda arquivos: o síndico cadastra um LINK
 * (Google Drive, OneDrive, Dropbox...) e o morador abre esse link.
 * Guardar arquivos no próprio portal exige o plano pago do Firebase (fica para depois).
 */
import type { Papel } from "./permissoes";

// ---------- Categorias ----------

export const CATEGORIAS_DOCUMENTO = ["regimento", "convencao", "ata", "prestacao", "outro"] as const;
export type CategoriaDocumento = (typeof CATEGORIAS_DOCUMENTO)[number];

/** Nome de cada categoria (no plural: é o título do grupo na lista). */
export const NOME_CATEGORIA: Record<CategoriaDocumento, string> = {
  regimento: "Regimento interno",
  convencao: "Convenção",
  ata: "Atas de assembleia",
  prestacao: "Prestação de contas",
  outro: "Outros documentos",
};

/** Nome curto (etiqueta e opção do formulário). */
export const NOME_CATEGORIA_CURTO: Record<CategoriaDocumento, string> = {
  regimento: "Regimento",
  convencao: "Convenção",
  ata: "Ata",
  prestacao: "Prestação de contas",
  outro: "Outro",
};

export function ehCategoria(v: unknown): v is CategoriaDocumento {
  return typeof v === "string" && (CATEGORIAS_DOCUMENTO as readonly string[]).includes(v);
}

// ---------- Quem pode ver ----------

/** Públicos que o síndico escolhe no formulário. A administração SEMPRE vê tudo. */
export const PUBLICOS_DOCUMENTO = [
  { papel: "morador", rotulo: "Moradores" },
  { papel: "portaria", rotulo: "Equipe da portaria" },
  { papel: "conselheiro", rotulo: "Conselho" },
] as const satisfies readonly { papel: Papel; rotulo: string }[];

export type PapelEscolhido = (typeof PUBLICOS_DOCUMENTO)[number]["papel"];
export const PAPEIS_ESCOLHIDOS = PUBLICOS_DOCUMENTO.map((p) => p.papel) as readonly PapelEscolhido[];

/**
 * Lista final de quem vê: sem repetição, sempre com "admin", em ordem fixa.
 * Valores desconhecidos são ignorados.
 */
export function normalizarVisivelPara(lista: readonly unknown[]): Papel[] {
  const escolhidos = new Set(lista.filter((p): p is PapelEscolhido => (PAPEIS_ESCOLHIDOS as readonly unknown[]).includes(p)));
  return ["admin", ...PAPEIS_ESCOLHIDOS.filter((p) => escolhidos.has(p))];
}

/** Texto curto para a lista da administração. Ex.: "Moradores e Conselho". */
export function descreverVisibilidade(visivelPara: readonly string[]): string {
  const nomes = PUBLICOS_DOCUMENTO.filter((p) => visivelPara.includes(p.papel)).map((p) => p.rotulo);
  if (nomes.length === 0) return "Só a administração";
  if (nomes.length === 1) return nomes[0];
  return `${nomes.slice(0, -1).join(", ")} e ${nomes.at(-1)}`;
}

/** Um documento aparece na lista da pessoa? Só se estiver ativo e o papel dela estiver em "visivelPara". */
export function podeVerDocumento(doc: { ativo: boolean; visivelPara: readonly string[] }, papel: Papel): boolean {
  return doc.ativo && doc.visivelPara.includes(papel);
}

// ---------- Link ----------

export const TAMANHO_MAXIMO_LINK = 2000;

/**
 * Confere o link do documento. Devolve o link limpo, ou null se não servir.
 * Só aceita https (nada de http, javascript:, data:...), sem usuário/senha no
 * endereço e com um domínio de verdade (ex.: drive.google.com).
 */
export function linkSeguro(texto: string): string | null {
  const limpo = texto.trim();
  if (!limpo || limpo.length > TAMANHO_MAXIMO_LINK) return null;
  let url: URL;
  try {
    url = new URL(limpo);
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;
  if (url.username || url.password) return null;
  const host = url.hostname.toLowerCase();
  // Precisa de um ponto (ex.: "drive.google.com"); recusa "localhost" e endereços IP.
  if (!host.includes(".") || /^[\d.]+$/.test(host) || host.startsWith("[")) return null;
  return url.toString();
}

/** De onde é o link, para mostrar ao morador (ex.: "Google Drive"). null se não reconhecer. */
export function servicoDoLink(link: string): string | null {
  let host: string;
  try {
    host = new URL(link).hostname.toLowerCase();
  } catch {
    return null;
  }
  const termina = (dominio: string) => host === dominio || host.endsWith(`.${dominio}`);
  if (termina("drive.google.com") || termina("docs.google.com")) return "Google Drive";
  if (termina("onedrive.live.com") || termina("1drv.ms") || termina("sharepoint.com")) return "OneDrive";
  if (termina("dropbox.com")) return "Dropbox";
  return null;
}

// ---------- Agrupar para a lista ----------

/** Separa os documentos por categoria, na ordem fixa das categorias. Grupos vazios ficam de fora. */
export function agruparPorCategoria<T extends { categoria: CategoriaDocumento; titulo: string }>(
  docs: readonly T[],
): { categoria: CategoriaDocumento; nome: string; itens: T[] }[] {
  return CATEGORIAS_DOCUMENTO.map((categoria) => ({
    categoria,
    nome: NOME_CATEGORIA[categoria],
    itens: docs.filter((d) => d.categoria === categoria),
  })).filter((g) => g.itens.length > 0);
}
