/**
 * Validações de entrada compartilhadas (zod).
 * Tudo que chega do navegador passa por um destes esquemas antes de ser usado.
 */
import { z } from "zod";
import { PAPEIS } from "./permissoes";

/** IDs de documentos: letras, números, hífen e sublinhado. Impede caminhos como "../". */
export const idDocumento = z
  .string()
  .regex(/^[A-Za-z0-9_-]{1,64}$/, "Identificador inválido.");

export const pedidoSessao = z.object({
  idToken: z.string().min(20).max(8192),
});

export const pedidoDemo = z.object({
  perfil: z.enum(PAPEIS),
});

/** Mensagem curta e humana a partir de um erro do zod. */
export function mensagemDeErro(erro: z.ZodError): string {
  return erro.issues[0]?.message ?? "Dados inválidos.";
}
