/**
 * Leitura das informações do condomínio (telefones, horário e aviso).
 * Ficam em condominiums/{c}.informacoes; a chave do portal público em condominiums/{c}.portalPublico.
 *
 * Sempre devolvemos uma LISTA FECHADA de campos (nunca o documento inteiro).
 */
import "server-only";
import { cache } from "react";
import { adminDb } from "../firebase-admin";
import type { Contexto } from "../contexto";
import { idDocumento } from "@/lib/validacao";
import { LIMITE_AVISO, LIMITE_HORARIO, normalizarTelefone } from "@/lib/validacao-informacoes";

export type InformacoesPublicas = {
  telefonePortaria: string | null;
  telefoneAdministracao: string | null;
  whatsappAdministracao: string | null;
  horarioAdministracao: string | null;
  aviso: string | null;
};

const VAZIAS: InformacoesPublicas = {
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

function lerInformacoes(bruto: unknown): InformacoesPublicas {
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

/**
 * Informações que qualquer pessoa com o link público pode ver.
 * Quem chama já conferiu o condomínio (condominioPublico); aqui só lemos os campos públicos.
 */
export const informacoesPublicas = cache(async (condominioId: string): Promise<InformacoesPublicas> => {
  if (!idDocumento.safeParse(condominioId).success) return { ...VAZIAS };
  const doc = await adminDb().collection("condominiums").doc(condominioId).get();
  if (!doc.exists) return { ...VAZIAS };
  return lerInformacoes(doc.get("informacoes"));
});

/** Para a tela do síndico: as informações + se o portal dos moradores está ligado. */
export async function informacoesParaEdicao(
  ctx: Contexto,
): Promise<InformacoesPublicas & { portalPublico: boolean }> {
  const doc = await adminDb().collection("condominiums").doc(ctx.condominioId).get();
  return {
    ...lerInformacoes(doc.get("informacoes")),
    portalPublico: doc.get("portalPublico") === true,
  };
}
