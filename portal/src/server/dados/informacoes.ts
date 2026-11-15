/**
 * Leitura das informações do condomínio: telefones, horário, aviso, PIX da
 * taxa, ronda noturna, responsável pelas reservas e link da votação oficial.
 * Ficam em condominiums/{c}.informacoes. Só aparecem para quem está logado
 * (área do morador e painel do síndico); o condomínio vem sempre da sessão.
 *
 * Sempre devolvemos uma LISTA FECHADA de campos (nunca o documento inteiro).
 * Obs.: o campo antigo condominiums/{c}.portalPublico pode ainda existir no
 * banco, mas não tem mais efeito nenhum (não existe área sem login).
 */
import "server-only";
import { cache } from "react";
import { adminDb } from "../firebase-admin";
import { garantirPermissao, type Contexto } from "../contexto";
import { idDocumento } from "@/lib/validacao";
import {
  ehTipoChavePix,
  LIMITE_AVISO,
  LIMITE_FAVORECIDO,
  LIMITE_HORARIO,
  LIMITE_NOME_RESPONSAVEL,
  normalizarChavePix,
  normalizarLinkHttps,
  normalizarTelefone,
  type ChavePix,
  type ResponsavelReservas,
} from "@/lib/validacao-informacoes";

export type InformacoesDoCondominio = {
  telefonePortaria: string | null;
  telefoneAdministracao: string | null;
  whatsappAdministracao: string | null;
  horarioAdministracao: string | null;
  aviso: string | null;
  /** PIX da taxa condominial (chave já normalizada). */
  pix: ChavePix | null;
  telefoneRonda: string | null;
  responsavelReservas: ResponsavelReservas | null;
  /** Link https da votação oficial (abre em nova aba). */
  linkVotacao: string | null;
};

const VAZIAS: InformacoesDoCondominio = {
  telefonePortaria: null,
  telefoneAdministracao: null,
  whatsappAdministracao: null,
  horarioAdministracao: null,
  aviso: null,
  pix: null,
  telefoneRonda: null,
  responsavelReservas: null,
  linkVotacao: null,
};

// Confere cada campo de novo na leitura: se algo estranho foi gravado, não aparece.
function telefone(v: unknown): string | null {
  return typeof v === "string" ? normalizarTelefone(v) : null;
}
function texto(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  const t = v.replace(/\s+/g, " ").trim();
  return t ? t.slice(0, max) : null;
}
function objeto(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function lerPix(v: unknown): ChavePix | null {
  const p = objeto(v);
  if (!p || !ehTipoChavePix(p.tipo) || typeof p.chave !== "string") return null;
  const chave = normalizarChavePix(p.tipo, p.chave);
  const favorecido = texto(p.favorecido, LIMITE_FAVORECIDO);
  return chave && favorecido ? { chave, tipo: p.tipo, favorecido } : null;
}

function lerResponsavel(v: unknown): ResponsavelReservas | null {
  const r = objeto(v);
  if (!r) return null;
  const nome = texto(r.nome, LIMITE_NOME_RESPONSAVEL);
  const tel = telefone(r.telefone);
  return nome && tel ? { nome, telefone: tel, horario: texto(r.horario, LIMITE_HORARIO) } : null;
}

function lerInformacoes(bruto: unknown): InformacoesDoCondominio {
  const i = objeto(bruto);
  if (!i) return { ...VAZIAS };
  return {
    telefonePortaria: telefone(i.telefonePortaria),
    telefoneAdministracao: telefone(i.telefoneAdministracao),
    whatsappAdministracao: telefone(i.whatsappAdministracao),
    horarioAdministracao: texto(i.horarioAdministracao, LIMITE_HORARIO),
    aviso: texto(i.aviso, LIMITE_AVISO),
    pix: lerPix(i.pix),
    telefoneRonda: telefone(i.telefoneRonda),
    responsavelReservas: lerResponsavel(i.responsavelReservas),
    linkVotacao: typeof i.linkVotacao === "string" ? normalizarLinkHttps(i.linkVotacao) : null,
  };
}

/** Lê as informações do banco (uma vez por pedido). */
const lerDoBanco = cache(async (condominioId: string): Promise<InformacoesDoCondominio> => {
  if (!idDocumento.safeParse(condominioId).success) return { ...VAZIAS };
  const doc = await adminDb().collection("condominiums").doc(condominioId).get();
  if (!doc.exists) return { ...VAZIAS };
  return lerInformacoes(doc.get("informacoes"));
});

/** Informações do condomínio de quem está logado (exige "informacoes.ver"). */
export async function informacoesDoCondominio(ctx: Contexto): Promise<InformacoesDoCondominio> {
  garantirPermissao(ctx, "informacoes.ver");
  return lerDoBanco(ctx.condominioId);
}

/** Para a tela do síndico (exige "informacoes.gerenciar"). */
export async function informacoesParaEdicao(ctx: Contexto): Promise<InformacoesDoCondominio> {
  garantirPermissao(ctx, "informacoes.gerenciar");
  const doc = await adminDb().collection("condominiums").doc(ctx.condominioId).get();
  return lerInformacoes(doc.get("informacoes"));
}
