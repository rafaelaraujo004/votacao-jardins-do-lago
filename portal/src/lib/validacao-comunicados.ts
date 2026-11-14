/**
 * Validações (zod) dos formulários de comunicados.
 * Tudo que chega do navegador passa por aqui antes de ser usado.
 */
import { z } from "zod";
import { idDocumento } from "./validacao";
import { LIMITE_TEXTO, LIMITE_TITULO, MUDANCAS, PRIORIDADES, limparTexto, limparTitulo } from "./comunicados";

/** Caixa de marcar: o navegador manda "on" (ou "sim") quando marcada e nada quando não. */
const marcado = z
  .union([z.literal("on"), z.literal("sim"), z.literal("")])
  .optional()
  .transform((v) => v === "on" || v === "sim");

/**
 * Criar ou editar um comunicado.
 * - destino "salvar": novo vira rascunho; existente mantém a situação atual.
 * - destino "publicar": salva e publica.
 */
export const esquemaComunicado = z.object({
  id: z.union([z.literal(""), idDocumento]).optional().transform((v) => v || null),
  titulo: z
    .string({ error: "Escreva o título." })
    .transform(limparTitulo)
    .pipe(
      z
        .string()
        .min(3, "Escreva um título com pelo menos 3 letras.")
        .max(LIMITE_TITULO, `Título muito longo (máximo ${LIMITE_TITULO} caracteres).`),
    ),
  texto: z
    .string({ error: "Escreva o texto do comunicado." })
    .transform(limparTexto)
    .pipe(
      z
        .string()
        .min(3, "Escreva o texto do comunicado.")
        .max(LIMITE_TEXTO, `Texto muito longo (máximo ${LIMITE_TEXTO.toLocaleString("pt-BR")} caracteres).`),
    ),
  prioridade: z.enum(PRIORIDADES, { error: "Escolha a prioridade." }),
  fixado: marcado,
  destino: z.enum(["salvar", "publicar"], { error: "Escolha salvar ou publicar." }),
});
export type DadosComunicado = z.infer<typeof esquemaComunicado>;

/** Mudança rápida de situação (publicar, arquivar, fixar, desafixar). */
export const esquemaMudanca = z.object({
  id: idDocumento,
  mudanca: z.enum(MUDANCAS, { error: "Ação desconhecida." }),
});
