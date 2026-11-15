/**
 * Validações (zod) dos formulários da portaria, das visitas e das encomendas.
 * Tudo o que chega do navegador passa por aqui antes de ser usado.
 */
import { z } from "zod";
import { idDocumento } from "./validacao";
import { CHAVES_TIPO_ENCOMENDA, CHAVES_TIPO_VISITA, codigoValido, normalizarCodigo } from "./portaria";

/** Nome de pessoa: 2 a 80 letras, sem espaços sobrando. */
const nomePessoa = (mensagem: string) =>
  z
    .string()
    .trim()
    .transform((s) => s.replace(/\s+/g, " "))
    .pipe(z.string().min(2, mensagem).max(80, "Nome muito longo (máximo 80 letras)."));

const observacao = z
  .string()
  .trim()
  .max(200, "Observação muito longa (máximo 200 letras).")
  .optional()
  .transform((s) => s ?? "");

const dataISO = (mensagem: string) => z.string().regex(/^\d{4}-\d{2}-\d{2}$/, mensagem);

/** Caixa de confirmação marcada (o navegador manda "on"). */
const marcado = (mensagem: string) => z.literal("on", { error: mensagem });

// ---------- Morador ----------

export const esquemaAutorizarVisita = z
  .object({
    nome: nomePessoa("Informe o nome do visitante."),
    tipo: z.enum(CHAVES_TIPO_VISITA, { error: "Escolha o tipo de visita." }),
    data: dataISO("Informe o dia da visita."),
    duracao: z.enum(["dia", "periodo"], { error: "Escolha se vale só um dia ou um período." }),
    validaAte: z.string().optional(),
    observacao,
  })
  // "Só este dia": a validade termina no mesmo dia. "Período": precisa da data final.
  .transform((v, ctx) => {
    const validaAte = v.duracao === "dia" ? v.data : (v.validaAte ?? "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(validaAte)) {
      ctx.addIssue({ code: "custom", message: "Informe até quando a autorização vale." });
      return z.NEVER;
    }
    return { ...v, validaAte };
  });

export const esquemaCancelarVisita = z.object({ id: idDocumento });

// ---------- Portaria ----------

/** Código digitado: aceita minúsculas, espaços e hífen ("k7m 4px"). */
export const esquemaCodigo = z.object({
  codigo: z
    .string()
    .transform(normalizarCodigo)
    .refine(codigoValido, "Código inválido. São 6 letras e números, como K7M-4PX."),
});

export const esquemaEntradaSemCodigo = z.object({
  unitId: idDocumento.or(z.literal("")).refine(Boolean, "Escolha a casa."),
  nome: nomePessoa("Informe o nome do visitante."),
  tipo: z.enum(CHAVES_TIPO_VISITA, { error: "Escolha o tipo de visita." }),
  confirmado: marcado("Confirme que falou com o morador por telefone antes de liberar."),
});

export const esquemaSaida = z.object({ id: idDocumento });

export const esquemaEncomenda = z.object({
  unitId: idDocumento.or(z.literal("")).refine(Boolean, "Escolha a casa."),
  destinatario: nomePessoa("Informe para quem é a encomenda."),
  tipo: z.enum(CHAVES_TIPO_ENCOMENDA, { error: "Escolha o tipo de encomenda." }),
  observacao,
});

export const esquemaEntregaEncomenda = z.object({
  id: idDocumento,
  retiradoPor: nomePessoa("Informe quem retirou a encomenda."),
  confirmado: marcado("Confirme que entregou a encomenda."),
});

// ---------- Administração (filtros do histórico, lidos da barra de endereço) ----------

export const esquemaFiltroHistorico = z.object({
  data: dataISO("Data inválida.").optional().catch(undefined),
  casa: idDocumento.optional().catch(undefined),
  aba: z.enum(["acessos", "encomendas"]).optional().catch(undefined),
});
