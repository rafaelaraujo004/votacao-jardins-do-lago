/**
 * Validações (zod) dos formulários da votação oficial.
 * Tudo que chega do navegador passa por aqui antes de ser usado.
 */
import { z } from "zod";
import { idDocumento } from "./validacao";
import { REGEX_DATA_HORA } from "./enquetes";
import {
  MAX_CANDIDATOS,
  MAX_ESCOLHAS,
  MAX_VAGAS,
  MODOS_ELEICAO,
  REGRAS_DESEMPATE,
  montarCandidatos,
} from "./eleicoes";

/** Campo que pode vir repetido (vira lista) ou uma vez só (vira lista de 1). */
const lista = (max: number, tamanho: number) =>
  z.preprocess(
    (v) => (v === undefined ? [] : Array.isArray(v) ? v : [v]),
    z.array(z.string().max(tamanho, "Texto muito longo.")).max(max),
  );

const dataHora = (rotulo: string) =>
  z
    .string()
    .trim()
    .regex(REGEX_DATA_HORA, `Escolha a data e a hora de ${rotulo}.`);

const inteiro = (min: number, max: number, mensagem: string) =>
  z.coerce
    .number({ error: mensagem })
    .int(mensagem)
    .min(min, mensagem)
    .max(max, mensagem);

/**
 * Criar ou alterar (só rascunho) uma eleição, com os candidatos.
 * Os candidatos chegam em listas paralelas (candNome[], candCasa[]...), uma posição por linha.
 * As datas continuam como texto "AAAA-MM-DDTHH:MM" no fuso do condomínio.
 */
export const esquemaEleicao = z
  .object({
    id: z.union([z.literal(""), idDocumento]).optional(),
    titulo: z
      .string()
      .trim()
      .min(5, "Escreva o nome da eleição (pelo menos 5 letras).")
      .max(120, "Nome muito longo (máximo 120 caracteres)."),
    cargo: z
      .string()
      .trim()
      .min(3, "Diga para que cargo é a eleição.")
      .max(80, "Cargo muito longo (máximo 80 caracteres)."),
    modo: z
      .enum(MODOS_ELEICAO, { error: "Escolha como será a votação." })
      .default("chapa"),
    // Só no modo "candidatos" (na chapa não aparecem no formulário).
    vagas: inteiro(
      1,
      MAX_VAGAS,
      `Número de vagas: de 1 a ${MAX_VAGAS}.`,
    ).optional(),
    escolhasPorCasa: inteiro(
      1,
      MAX_ESCOLHAS,
      `Cada casa escolhe de 1 a ${MAX_ESCOLHAS} candidatos.`,
    ).optional(),
    permiteBranco: z
      .enum(["sim", "nao"], { error: "Diga se aceita voto em branco." })
      .optional(),
    regraDesempate: z
      .enum(REGRAS_DESEMPATE, { error: "Escolha a regra de desempate." })
      .optional(),
    abreEm: dataHora("abertura"),
    fechaEm: dataHora("encerramento"),
    candNome: lista(MAX_CANDIDATOS + 5, 200),
    candFuncao: lista(MAX_CANDIDATOS + 5, 200),
    candCasa: lista(MAX_CANDIDATOS + 5, 200),
    candApresentacao: lista(MAX_CANDIDATOS + 5, 600),
    candNascimento: lista(MAX_CANDIDATOS + 5, 20),
  })
  .transform((v, contexto) => {
    const simNao = v.modo === "chapa";
    if (
      !simNao &&
      (v.vagas === undefined ||
        v.escolhasPorCasa === undefined ||
        !v.permiteBranco ||
        !v.regraDesempate)
    ) {
      contexto.addIssue({
        code: "custom",
        message:
          "Preencha vagas, escolhas por casa, voto em branco e desempate.",
      });
      return z.NEVER;
    }
    const vagas = v.vagas ?? 1;
    const escolhasPorCasa = simNao ? 1 : (v.escolhasPorCasa ?? 1);
    if (!simNao && escolhasPorCasa > vagas) {
      contexto.addIssue({
        code: "custom",
        message:
          "Cada casa não pode escolher mais candidatos do que o número de vagas.",
      });
      return z.NEVER;
    }
    if (v.fechaEm <= v.abreEm) {
      contexto.addIssue({
        code: "custom",
        message: "O encerramento precisa ser depois da abertura.",
      });
      return z.NEVER;
    }
    const linhas = v.candNome.map((nome, i) => ({
      nome,
      funcao: v.candFuncao[i] ?? "",
      casa: v.candCasa[i] ?? "",
      apresentacao: v.candApresentacao[i] ?? "",
      nascimento: v.candNascimento[i] ?? "",
    }));
    const candidatos = montarCandidatos(linhas);
    if (typeof candidatos === "string") {
      contexto.addIssue({ code: "custom", message: candidatos });
      return z.NEVER;
    }
    return {
      id: v.id || null,
      titulo: v.titulo,
      cargo: v.cargo,
      modo: v.modo,
      // Na chapa: "vagas" = número de integrantes; sem branco nem desempate por idade.
      vagas: simNao ? candidatos.length : vagas,
      escolhasPorCasa,
      permiteBranco: simNao ? false : v.permiteBranco === "sim",
      regraDesempate: simNao ? ("comissao" as const) : v.regraDesempate!,
      abreEm: v.abreEm,
      fechaEm: v.fechaEm,
      candidatos,
    };
  });

export type DadosEleicao = z.output<typeof esquemaEleicao>;

/** Publicar ou voltar para rascunho: só o id. */
export const esquemaIdEleicao = z.object({ id: idDocumento });

/**
 * Cédula: a CASA vem do cadastro de quem vota (nunca do formulário).
 * "escolha" pode vir repetida (várias caixas marcadas) ou ser "branco".
 */
export const esquemaCedula = z.object({
  id: idDocumento,
  escolha: z.preprocess(
    (v) => (v === undefined ? [] : Array.isArray(v) ? v : [v]),
    z
      .array(
        z
          .string()
          .regex(
            /^(c\d{1,2}|branco|sim|nao)$/,
            "Escolha inválida. Atualize a página.",
          ),
      )
      .max(MAX_ESCOLHAS + 1),
  ),
});

const listaIds = z.preprocess(
  (v) => (v === undefined ? [] : Array.isArray(v) ? v : [v]),
  z.array(idDocumento).max(2000),
);

/** Mudanças no bloqueio de casas (só o que a pessoa marcou ou desmarcou). */
export const esquemaBloqueio = z.object({
  id: idDocumento,
  adicionar: listaIds,
  remover: listaIds,
});

/** Gerar links (só o id da eleição) ou trocar/marcar o link de UMA casa. */
export const esquemaLinkCasa = z.object({
  id: idDocumento,
  unitId: idDocumento,
});

/** Voto pelo link: o código (10 letras/números) e a escolha. A casa vem do código, no servidor. */
export const esquemaVotoLink = z.object({
  codigo: z
    .string()
    .trim()
    .transform((v) => v.toUpperCase().replace(/[\s-]/g, ""))
    .pipe(
      z
        .string()
        .regex(
          /^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{10}$/,
          "Link de voto inválido.",
        ),
    ),
  escolha: esquemaCedula.shape.escolha,
});

/** Tamanho máximo da foto de um integrante (já reduzida no navegador para ~320px). */
export const MAX_FOTO_DATAURL = 300_000;

/** Foto de um integrante da chapa: imagem pequena em "data URL" (JPEG/PNG/WebP). Vazia = tirar a foto. */
export const esquemaFotoCandidato = z.object({
  id: idDocumento,
  candidato: z.string().regex(/^c\d{1,2}$/, "Integrante inválido."),
  foto: z
    .string()
    .max(MAX_FOTO_DATAURL, "A foto ficou grande demais. Escolha outra.")
    .regex(/^(data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2})?$/, "Arquivo de foto inválido."),
});
