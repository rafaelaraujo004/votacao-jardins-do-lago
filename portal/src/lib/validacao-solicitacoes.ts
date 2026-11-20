/**
 * Validações (zod) dos formulários de solicitações.
 * Tudo que chega do navegador passa por aqui antes de ser usado.
 * A CASA nunca vem do formulário: sai do cadastro de quem está logado.
 */
import { z } from "zod";
import { idDocumento } from "./validacao";
import { CATEGORIAS_SOLICITACAO, STATUS_SOLICITACAO } from "./solicitacoes";

const descricao = z
  .string()
  .trim()
  .min(10, "Descreva o problema com pelo menos 10 letras.")
  .max(1000, "Descrição muito longa (máximo 1.000 caracteres).");

const comentario = z
  .string()
  .trim()
  .min(2, "Escreva a mensagem.")
  .max(1000, "Mensagem muito longa (máximo 1.000 caracteres).");

/** "sim"/"nao" de um campo de escolha → verdadeiro/falso. */
const simNao = (mensagem: string) => z.enum(["sim", "nao"], { error: mensagem }).transform((v) => v === "sim");

/** Morador abre uma solicitação. */
export const esquemaAbrirSolicitacao = z.object({
  categoria: z.enum(CATEGORIAS_SOLICITACAO, { error: "Escolha o assunto." }),
  local: z
    .string()
    .trim()
    .min(2, "Diga onde é (ex.: em frente à Casa 12, portão principal).")
    .max(120, "Local muito longo (máximo 120 caracteres)."),
  descricao,
});

/** Morador comenta na solicitação da casa dele. */
export const esquemaComentarSolicitacao = z.object({ id: idDocumento, texto: comentario });

/** Morador cancela (motivo opcional). */
export const esquemaCancelarSolicitacao = z.object({
  id: idDocumento,
  motivo: z.string().trim().max(300, "Motivo muito longo (máximo 300 caracteres).").default(""),
});

/** Administração muda a situação, com um comentário (opcional) que pode ser público ou interno. */
export const esquemaMudarStatusSolicitacao = z
  .object({
    id: idDocumento,
    status: z.enum(STATUS_SOLICITACAO, { error: "Escolha a nova situação." }),
    comentario: z.string().trim().max(1000, "Comentário muito longo (máximo 1.000 caracteres).").default(""),
    publico: simNao("Diga se o morador pode ver o comentário.").default(true),
  })
  // Não atender (cancelar) exige explicar ao morador por quê — e ele precisa poder ler.
  .refine((v) => v.status !== "cancelada" || v.comentario.length >= 3, {
    message: "Para cancelar (não atender) a solicitação, escreva um comentário para o morador explicando o motivo.",
  })
  .refine((v) => v.status !== "cancelada" || v.publico, {
    message: "O comentário do cancelamento precisa ficar visível para o morador.",
  });

/** Administração responde (público) ou escreve uma nota interna. */
export const esquemaResponderSolicitacao = z.object({
  id: idDocumento,
  texto: comentario,
  publico: simNao("Diga se o morador pode ver a mensagem."),
});

/** Filtros da lista da administração (vêm do endereço da página). */
export const esquemaFiltrosSolicitacoes = z.object({
  status: z.enum([...STATUS_SOLICITACAO, "ativas", "todas"]).catch("ativas"),
  categoria: z.enum([...CATEGORIAS_SOLICITACAO, "todas"]).catch("todas"),
});
export type FiltrosSolicitacoes = z.output<typeof esquemaFiltrosSolicitacoes>;

/** Lê os filtros do endereço; qualquer valor estranho volta ao padrão. */
export function lerFiltrosSolicitacoes(params: Record<string, string | string[] | undefined>): FiltrosSolicitacoes {
  const um = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  return esquemaFiltrosSolicitacoes.parse({ status: um(params.status), categoria: um(params.categoria) });
}
