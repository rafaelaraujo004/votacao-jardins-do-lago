/**
 * CONDOMÍNIO DO LINK PÚBLICO (moradores não fazem login).
 *
 * Qual condomínio aparece na área pública:
 * - o do parâmetro ?c=<id> (ex.: "/?c=jardins-do-lago-demo"), se vier; senão
 * - o da variável de ambiente CONDOMINIO_PUBLICO (padrão "jardins-do-lago").
 *
 * Só aparece um condomínio cujo documento tenha portalPublico === true e
 * status "ativo". Qualquer outro caso devolve null ("Portal indisponível"),
 * sem dizer se o condomínio existe ou não.
 *
 * Daqui só saem 4 campos (id, nome, fuso, demo): nunca o documento inteiro.
 */
import "server-only";
import { cache } from "react";
import { adminDb } from "./firebase-admin";
import { FUSO_PADRAO } from "@/lib/formato";

export type CondominioPublico = { id: string; nome: string; fuso: string; demo: boolean };

/** Condomínio usado quando a variável CONDOMINIO_PUBLICO não está definida. */
export const ID_PUBLICO_PADRAO = "jardins-do-lago";

/** Formato aceito para o id (letras minúsculas, números e hífen). Evita caminhos estranhos no banco. */
const REGEX_ID = /^[a-z0-9][a-z0-9-]{0,62}$/;

export function idValido(id: unknown): id is string {
  return typeof id === "string" && REGEX_ID.test(id);
}

/** Id do condomínio padrão do link público (variável de ambiente, se for válida). */
export function idPublicoPadrao(valorDaVariavel: string | undefined = process.env.CONDOMINIO_PUBLICO): string {
  const v = valorDaVariavel?.trim();
  return idValido(v) ? v : ID_PUBLICO_PADRAO;
}

/**
 * Escolhe o id a partir do ?c= (lógica pura, testada em tests/unit/publico.test.ts).
 * - sem ?c= (ou vazio) → padrão;
 * - ?c= inválido → null (não tentamos adivinhar).
 */
export function escolherIdPublico(c: string | string[] | undefined | null, padrao: string): string | null {
  const bruto = Array.isArray(c) ? c[0] : c;
  if (bruto === undefined || bruto === null || bruto.trim() === "") return padrao;
  const id = bruto.trim();
  return idValido(id) ? id : null;
}

/** "" quando o id é o padrão; "?c=<id>" quando é outro (para montar os links). */
export function sufixoDoId(id: string, padrao: string): string {
  return id === padrao ? "" : `?c=${encodeURIComponent(id)}`;
}

/** Sufixo de link do condomínio público: "" para o padrão ou "?c=<id>" para outro. */
export function sufixoC(cp: CondominioPublico): string {
  return sufixoDoId(cp.id, idPublicoPadrao());
}

/**
 * Junta um caminho (que já pode ter "?mes=...") com o ?c= do condomínio.
 * Ex.: comC("/financeiro?mes=2026-10", "?c=demo") → "/financeiro?mes=2026-10&c=demo".
 */
export function comC(caminho: string, sufixo: string): string {
  if (!sufixo) return caminho;
  return caminho.includes("?") ? `${caminho}&${sufixo.slice(1)}` : `${caminho}${sufixo}`;
}

/** Lê o condomínio no banco (uma vez por pedido) e confere se ele pode aparecer em público. */
const lerCondominioPublico = cache(async (id: string): Promise<CondominioPublico | null> => {
  try {
    const doc = await adminDb().collection("condominiums").doc(id).get();
    if (!doc.exists) return null;
    if (doc.get("portalPublico") !== true || doc.get("status") !== "ativo") return null;
    const nome = doc.get("nome");
    const fuso = doc.get("fuso");
    return {
      id: doc.id,
      nome: typeof nome === "string" && nome ? nome : "Condomínio",
      fuso: typeof fuso === "string" && fuso ? fuso : FUSO_PADRAO,
      demo: doc.get("demo") === true,
    };
  } catch (erro) {
    // Banco fora do ar: a página mostra "Portal indisponível" em vez de quebrar.
    console.error("Portal público: não foi possível ler o condomínio", erro);
    return null;
  }
});

/** Condomínio do link público (a partir do ?c= ou de CONDOMINIO_PUBLICO). */
export async function condominioPublico(c?: string | string[]): Promise<CondominioPublico | null> {
  const id = escolherIdPublico(c, idPublicoPadrao());
  if (!id) return null;
  return lerCondominioPublico(id);
}
