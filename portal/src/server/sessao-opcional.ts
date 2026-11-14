/**
 * SESSÃO OPCIONAL — para as páginas públicas dos moradores.
 *
 * Diz quem está logado, SE alguém estiver, sem mandar ninguém para /entrar.
 * Se o banco falhar, a página pública continua abrindo (como se ninguém
 * estivesse logado). Para exigir login, use exigirPermissao (contexto.ts).
 */
import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { exigirPermissao, getContexto, type Contexto } from "./contexto";
import { NOME_DO_PAPEL, type Permissao } from "@/lib/permissoes";
import { linkEntrar } from "@/lib/destino-seguro";

export const sessaoOpcional = cache(async (): Promise<Contexto | null> => {
  try {
    return await getContexto();
  } catch (erro) {
    console.error("Sessão opcional: não foi possível ler a sessão", erro);
    return null;
  }
});

/** Texto curto para o topo: "Casa 12" para o morador, o perfil para a equipe. */
export function rotuloDaSessao(ctx: Contexto): string {
  if (ctx.papel === "morador") return ctx.unidadeRotulo ?? "Minha casa";
  return NOME_DO_PAPEL[ctx.papel];
}

/**
 * Para as páginas da CASA (visitas, encomendas): sem sessão → /entrar?volta=<esta página>.
 * Com sessão, segue as regras de sempre (senha provisória → troca; sem permissão → "sem acesso").
 */
export async function exigirLoginDaCasa(permissao: Permissao, volta: string, c?: string | string[]): Promise<Contexto> {
  if (!(await sessaoOpcional())) {
    const id = Array.isArray(c) ? c[0] : c;
    redirect(linkEntrar(volta, id?.trim().slice(0, 64) || null));
  }
  return exigirPermissao(permissao);
}
