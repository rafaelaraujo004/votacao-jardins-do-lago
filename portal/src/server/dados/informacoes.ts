/**
 * Leitura das informações do condomínio (telefones, horário e aviso).
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
import { LIMITE_AVISO, LIMITE_HORARIO, normalizarTelefone } from "@/lib/validacao-informacoes";

export type InformacoesDoCondominio = {
  telefonePortaria: string | null;
  telefoneAdministracao: string | null;
  whatsappAdministracao: string | null;
  horarioAdministracao: string | null;
  aviso: string | null;
};

const VAZIAS: InformacoesDoCondominio = {
  telefonePortaria: null,
  telefoneAdministracao: null,
  whatsappAdministracao: null,
  horarioAdministracao: null,
  aviso: null,
};

// Confere cada campo de novo na leitura: se algo estranho foi gravado, não aparece.
function telefone(v: unknown): string | null {
  return typeof v === "string" ? normalizarTelefone(v) : null;
}
function texto(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t ? t.slice(0, max) : null;
}

function lerInformacoes(bruto: unknown): InformacoesDoCondominio {
  if (!bruto || typeof bruto !== "object") return { ...VAZIAS };
  const i = bruto as Record<string, unknown>;
  return {
    telefonePortaria: telefone(i.telefonePortaria),
    telefoneAdministracao: telefone(i.telefoneAdministracao),
    whatsappAdministracao: telefone(i.whatsappAdministracao),
    horarioAdministracao: texto(i.horarioAdministracao, LIMITE_HORARIO),
    aviso: texto(i.aviso, LIMITE_AVISO),
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
