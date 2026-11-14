/**
 * Validações (zod) dos formulários dos classificados.
 * Tudo que chega do navegador passa por aqui antes de ser usado.
 */
import { z } from "zod";
import { idDocumento } from "./validacao";
import { reaisParaCentavos } from "./formato";
import { CATEGORIAS_CLASSIFICADO, normalizarWhatsapp, problemaNoConteudo } from "./classificados";

/** Maior preço aceito: R$ 10 milhões (em centavos). */
const PRECO_MAXIMO = 1_000_000_000;

/** Anúncio novo do morador. A casa e o autor vêm da sessão, nunca do formulário. */
export const esquemaAnuncio = z
  .object({
    titulo: z
      .string({ error: "Informe o título do anúncio." })
      .trim()
      .min(4, "Escreva um título com pelo menos 4 letras (ex.: Bicicleta aro 26).")
      .max(80, "Título muito longo (máximo 80 caracteres)."),
    texto: z
      .string({ error: "Descreva o anúncio." })
      .trim()
      .min(10, "Descreva o anúncio com pelo menos 10 letras.")
      .max(1000, "Descrição muito longa (máximo 1.000 caracteres)."),
    categoria: z.enum(CATEGORIAS_CLASSIFICADO, { error: "Escolha a categoria do anúncio." }),
    preco: z.string().trim().max(20, "Preço inválido.").default(""),
    whatsapp: z.string().trim().max(25, "Número de WhatsApp inválido.").default(""),
    /** Caixa "Entendo que o número ficará visível" (só vale se houver WhatsApp). */
    cienteContato: z.string().optional(),
  })
  .transform((v, contexto) => {
    const problema = problemaNoConteudo(`${v.titulo}\n${v.texto}`);
    if (problema) {
      contexto.addIssue({ code: "custom", message: problema });
      return z.NEVER;
    }

    // Preço: opcional; doação nunca tem preço.
    let preco: number | null = null;
    if (v.preco && v.categoria !== "doacao") {
      const centavos = reaisParaCentavos(v.preco);
      if (centavos === null || centavos < 0 || centavos > PRECO_MAXIMO) {
        contexto.addIssue({ code: "custom", message: "Preço inválido. Use só números, ex.: 150 ou 1.200,50." });
        return z.NEVER;
      }
      preco = centavos === 0 ? null : centavos;
    }

    // WhatsApp: opcional; se vier, precisa ser válido e a pessoa precisa concordar em mostrar.
    let contatoWhatsapp: string | null = null;
    if (v.whatsapp) {
      contatoWhatsapp = normalizarWhatsapp(v.whatsapp);
      if (!contatoWhatsapp) {
        contexto.addIssue({ code: "custom", message: "WhatsApp inválido. Use o DDD + número, ex.: (91) 98888-7777." });
        return z.NEVER;
      }
      if (v.cienteContato !== "sim") {
        contexto.addIssue({
          code: "custom",
          message: "Marque a caixa confirmando que o seu WhatsApp ficará visível para os moradores (ou deixe o campo vazio).",
        });
        return z.NEVER;
      }
    }

    return {
      titulo: v.titulo,
      texto: v.texto,
      categoria: v.categoria,
      preco,
      contatoWhatsapp,
    };
  });

/** Ações que só precisam do anúncio (aprovar, remover o próprio). */
export const esquemaIdAnuncio = z.object({ id: idDocumento });

/** Rejeitar ou remover pela moderação: o motivo é obrigatório (o autor vai ler). */
export const esquemaMotivoAnuncio = z.object({
  id: idDocumento,
  motivo: z
    .string({ error: "Explique o motivo." })
    .trim()
    .min(3, "Explique o motivo (pelo menos 3 letras). O autor vai ler.")
    .max(300, "Motivo muito longo (máximo 300 caracteres)."),
});
