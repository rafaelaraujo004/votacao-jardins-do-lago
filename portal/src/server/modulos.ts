import "server-only";
/**
 * Links curtos que só encaminham (/sindico, /conselho, /morador): levam a pessoa para a
 * versão do módulo do perfil dela. Sem login, o proxy já mandou para /entrar?volta=<link>.
 * Veja src/lib/modulos.ts.
 */
import { redirect } from "next/navigation";
import { exigirContexto } from "./contexto";
import { destinoDoModulo, moduloPeloLink } from "@/lib/modulos";

export async function abrirModulo(link: "/sindico" | "/conselho" | "/morador"): Promise<never> {
  const ctx = await exigirContexto(link);
  const modulo = moduloPeloLink(link);
  redirect((modulo && destinoDoModulo(modulo, ctx.papel, ctx.permissoes)) || "/sem-acesso");
}
