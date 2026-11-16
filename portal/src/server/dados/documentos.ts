import "server-only";
import type { DocumentData, Timestamp } from "firebase-admin/firestore";
import { adminDb } from "../firebase-admin";
import { garantirPermissao, type Contexto } from "../contexto";
import type { AcaoAuditada } from "../auditoria";
import { idDocumento } from "@/lib/validacao";
import {
  ehCategoria,
  linkSeguro,
  podeVerDocumento,
  tipoArquivoAceito,
  type CategoriaDocumento,
} from "@/lib/documentos";

/**
 * Dados dos documentos do condomínio (documents/{id}).
 *
 * - Cada documento é um ARQUIVO guardado no Storage (campo "arquivo") ou um
 *   LINK (Google Drive etc.). O arquivo nunca vai direto para o navegador: a
 *   tela recebe o endereço /api/documentos/{id}/arquivo, que confere o login.
 * - Nada é apagado: o síndico desativa e o documento some para os moradores.
 * - As telas recebem uma LISTA FECHADA de campos (nunca o documento inteiro):
 *   quem cadastrou (uid) não sai daqui.
 */

const colecao = (ctx: Pick<Contexto, "condominioId">) =>
  adminDb().collection("condominiums").doc(ctx.condominioId).collection("documents");

/** O que o morador (e quem só pode ver) recebe de cada documento. */
export type DocumentoVisivel = {
  id: string;
  titulo: string;
  descricao: string;
  categoria: CategoriaDocumento;
  /**
   * Para onde o botão "Abrir" leva: o endereço protegido do portal (arquivo)
   * ou o link já conferido (só https). Documento sem nenhum dos dois nem aparece.
   */
  url: string;
  /** Preenchido quando é arquivo enviado ao portal (sem o caminho interno). */
  arquivo: { tipo: string; tamanho: number } | null;
  atualizadoEm: Date | null;
};

/** Arquivo guardado no Storage, como está no banco. */
export type ArquivoGuardado = { caminho: string; nome: string; tipo: string; tamanho: number };

/** Lê o campo "arquivo" do banco. null se não houver ou estiver estragado. */
export function lerArquivo(v: unknown): ArquivoGuardado | null {
  if (!v || typeof v !== "object") return null;
  const a = v as Record<string, unknown>;
  if (typeof a.caminho !== "string" || !a.caminho) return null;
  if (typeof a.tipo !== "string" || !tipoArquivoAceito(a.tipo)) return null;
  if (typeof a.tamanho !== "number" || !(a.tamanho > 0)) return null;
  return { caminho: a.caminho, nome: typeof a.nome === "string" && a.nome ? a.nome : "documento", tipo: a.tipo, tamanho: a.tamanho };
}

/** Endereço do portal que entrega o arquivo de um documento (confere o login). */
export function enderecoDoArquivo(id: string): string {
  return `/api/documentos/${id}/arquivo`;
}

/** O que a administração recebe (inclui quem vê e se está ativo). */
export type DocumentoGestao = DocumentoVisivel & {
  visivelPara: string[];
  ativo: boolean;
};

function texto(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function data(v: unknown): Date | null {
  return (v as Timestamp | undefined)?.toDate?.() ?? null;
}

/** Converte o documento do banco. Devolve null se não houver arquivo nem link seguro (ex.: lixo no banco). */
export function paraDocumento(id: string, d: DocumentData | undefined): DocumentoGestao | null {
  const arquivo = lerArquivo(d?.arquivo);
  const url = arquivo ? enderecoDoArquivo(id) : linkSeguro(texto(d?.url));
  if (!url) return null;
  return {
    arquivo: arquivo ? { tipo: arquivo.tipo, tamanho: arquivo.tamanho } : null,
    id,
    titulo: texto(d?.titulo) || "Documento",
    descricao: texto(d?.descricao),
    categoria: ehCategoria(d?.categoria) ? d.categoria : "outro",
    url,
    atualizadoEm: data(d?.atualizadoEm) ?? data(d?.criadoEm),
    visivelPara: Array.isArray(d?.visivelPara) ? d.visivelPara.filter((p: unknown): p is string => typeof p === "string") : [],
    ativo: d?.ativo !== false,
  };
}

/** Só os campos que o morador pode receber. */
function paraVisivel(doc: DocumentoGestao): DocumentoVisivel {
  return {
    id: doc.id,
    titulo: doc.titulo,
    descricao: doc.descricao,
    categoria: doc.categoria,
    url: doc.url,
    arquivo: doc.arquivo,
    atualizadoEm: doc.atualizadoEm,
  };
}

const porTitulo = (a: { titulo: string }, b: { titulo: string }) => a.titulo.localeCompare(b.titulo, "pt-BR");
const maisRecentes = (a: { atualizadoEm: Date | null }, b: { atualizadoEm: Date | null }) =>
  (b.atualizadoEm?.getTime() ?? 0) - (a.atualizadoEm?.getTime() ?? 0);

/**
 * Documentos ATIVOS que o perfil da pessoa pode ver (visivelPara contém o papel dela).
 * Ordenados por título (a tela agrupa por categoria).
 */
export async function documentosVisiveis(ctx: Contexto): Promise<DocumentoVisivel[]> {
  garantirPermissao(ctx, "documentos.ver");
  const gerencia = ctx.permissoes.has("documentos.gerenciar");
  // Quem gerencia lê tudo; os demais só o que tem o seu papel em "visivelPara" (o banco já filtra).
  const consulta = gerencia ? colecao(ctx) : colecao(ctx).where("visivelPara", "array-contains", ctx.papel);
  const snap = await consulta.get();
  return snap.docs
    .map((d) => paraDocumento(d.id, d.data()))
    .filter((d): d is DocumentoGestao => d !== null)
    // Desativados nunca aparecem nesta lista (a administração os vê em "todosOsDocumentos").
    .filter((d) => (gerencia ? d.ativo : podeVerDocumento(d, ctx.papel)))
    .map(paraVisivel)
    .sort(porTitulo);
}

/** Os mais recentes (para o cartão do Início). */
export async function documentosRecentes(ctx: Contexto, quantos = 3): Promise<DocumentoVisivel[]> {
  return (await documentosVisiveis(ctx)).sort(maisRecentes).slice(0, quantos);
}

/** Todos os documentos, inclusive os desativados (tela da administração). */
export async function todosOsDocumentos(ctx: Contexto): Promise<DocumentoGestao[]> {
  garantirPermissao(ctx, "documentos.gerenciar");
  const snap = await colecao(ctx).get();
  return snap.docs
    .map((d) => paraDocumento(d.id, d.data()))
    .filter((d): d is DocumentoGestao => d !== null)
    .sort((a, b) => Number(b.ativo) - Number(a.ativo) || porTitulo(a, b));
}

/** Um documento para editar. null se não existir. */
export async function obterDocumento(ctx: Contexto, id: string): Promise<DocumentoGestao | null> {
  garantirPermissao(ctx, "documentos.gerenciar");
  if (!idDocumento.safeParse(id).success) return null;
  const d = await colecao(ctx).doc(id).get();
  return d.exists ? paraDocumento(d.id, d.data()) : null;
}

/** Ações de auditoria deste módulo (todas estão em ACOES_AUDITADAS). */
export function acaoDocumento(a: "documento.criar" | "documento.editar" | "documento.desativar"): AcaoAuditada {
  return a;
}
