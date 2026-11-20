/**
 * Validações (zod) dos formulários de reservas e áreas de lazer.
 * Tudo que chega do navegador passa por aqui antes de ser usado.
 */
import { z } from "zod";
import { campoFotos, idDocumento } from "./validacao";
import {
  TIPOS_AREA,
  dataValida,
  normalizarFaixas,
  normalizarFaixasLivres,
  validarFaixas,
  validarFaixasLivres,
  type Faixa,
} from "./reservas";

/** Campo que pode vir repetido no formulário (vira lista) ou uma vez só (vira lista de 1). */
const lista = z.preprocess(
  (v) => (v === undefined ? [] : Array.isArray(v) ? v : [v]),
  z.array(z.string().max(80, "Texto muito longo.")).max(48),
);

/** Lista de textos (exigências, avisos): tira espaços e linhas vazias. */
const listaTextos = (rotulo: string, maxItens: number, maxLetras: number) =>
  z
    .preprocess(
      (v) => (v === undefined ? [] : Array.isArray(v) ? v : [v]),
      z.array(z.string().trim().max(maxLetras, `${rotulo}: cada item pode ter até ${maxLetras} caracteres.`)),
    )
    .transform((itens) => itens.filter(Boolean))
    .refine((itens) => itens.length <= maxItens, `${rotulo}: no máximo ${maxItens} itens.`);

/** Número inteiro digitado num campo de texto/número. */
const inteiro = (rotulo: string, min: number, max: number) =>
  z
    .string()
    .trim()
    .regex(/^\d+$/, `${rotulo}: use só números.`)
    .transform(Number)
    .refine((n) => n >= min && n <= max, `${rotulo}: use um número entre ${min} e ${max}.`);

/** "sim"/"nao" de um campo de escolha → verdadeiro/falso. */
const simNao = (mensagem: string) => z.enum(["sim", "nao"], { error: mensagem }).transform((v) => v === "sim");

/** Junta as três listas do formulário (rótulos, inícios e fins) numa lista de faixas, sem linhas vazias. */
export function juntarFaixas(rotulos: string[], inicios: string[], fins: string[]): Pick<Faixa, "rotulo" | "inicio" | "fim">[] {
  const n = Math.max(rotulos.length, inicios.length, fins.length);
  const faixas: Pick<Faixa, "rotulo" | "inicio" | "fim">[] = [];
  for (let i = 0; i < n; i++) {
    const rotulo = (rotulos[i] ?? "").trim();
    const inicio = (inicios[i] ?? "").trim();
    const fim = (fins[i] ?? "").trim();
    if (!rotulo && !inicio && !fim) continue; // linha deixada em branco
    faixas.push({ rotulo, inicio, fim });
  }
  return faixas;
}

export const esquemaArea = z
  .object({
    id: z.union([z.literal(""), idDocumento]).optional(),
    tipo: z.enum(TIPOS_AREA, { error: "Diga se é uma área ou um equipamento." }).default("area"),
    nome: z.string().trim().min(3, "Informe o nome (ex.: Salão de festas).").max(60, "Nome muito longo."),
    regras: z.string().trim().max(1500, "Regras muito longas (máximo 1.500 caracteres).").default(""),
    capacidade: inteiro("Capacidade", 0, 2000), // 0 = não informar
    exigeAprovacao: simNao("Diga se a área exige aprovação."),
    antecedenciaMinimaHoras: inteiro("Antecedência mínima", 0, 8760),
    antecedenciaMaxDias: inteiro("Antecedência máxima", 1, 365),
    prazoDesistenciaHoras: inteiro("Prazo de desistência", 0, 8760).default(0),
    limitePorMes: inteiro("Limite por casa no mês", 0, 31),
    /** Vazio = sem limite por dia. */
    limitePorCasaPorDia: z
      .string()
      .trim()
      .default("")
      .transform((v, contexto) => {
        if (v === "" || v === "0") return null;
        if (!/^\d+$/.test(v) || Number(v) < 1 || Number(v) > 48) {
          contexto.addIssue({ code: "custom", message: "Limite por casa no dia: use um número entre 1 e 48, ou deixe em branco." });
          return z.NEVER;
        }
        return Number(v);
      }),
    permitirExtraSeDiaLivre: simNao("Diga se pode passar do limite quando o dia estiver livre.").default(false),
    ativa: simNao("Diga se a área está ativa."),
    ordem: inteiro("Ordem", 0, 99).default(99),
    faixaRotulo: lista,
    faixaInicio: lista,
    faixaFim: lista,
    livreRotulo: lista,
    livreInicio: lista,
    livreFim: lista,
    exigencia: listaTextos("Exigências", 20, 200),
    aviso: listaTextos("Avisos", 10, 200),
    /** Quem aprova os pedidos desta área (vazio = síndico). O servidor confere se a pessoa pode. */
    responsavelUid: z
      .string()
      .trim()
      .default("")
      .refine((v) => v === "" || /^[A-Za-z0-9_-]{1,128}$/.test(v), "Escolha o responsável pela área de novo."),
    /** Fotos da área na ordem: "atual:N" (mantém) ou o caminho de uma foto nova. */
    fotos: campoFotos,
  })
  .transform((v, contexto) => {
    if (v.antecedenciaMaxDias * 24 < v.antecedenciaMinimaHoras) {
      contexto.addIssue({ code: "custom", message: "A antecedência máxima precisa ser maior ou igual à mínima." });
      return z.NEVER;
    }
    const faixas = juntarFaixas(v.faixaRotulo, v.faixaInicio, v.faixaFim);
    const problema = validarFaixas(faixas);
    if (problema) {
      contexto.addIssue({ code: "custom", message: problema });
      return z.NEVER;
    }
    const livres = juntarFaixas(v.livreRotulo, v.livreInicio, v.livreFim);
    const problemaLivres = validarFaixasLivres(livres, faixas);
    if (problemaLivres) {
      contexto.addIssue({ code: "custom", message: problemaLivres });
      return z.NEVER;
    }
    return {
      id: v.id || null,
      tipo: v.tipo,
      nome: v.nome,
      regras: v.regras,
      // Equipamento não tem "capacidade de pessoas": guarda 1.
      capacidade: v.tipo === "equipamento" ? 1 : v.capacidade,
      exigeAprovacao: v.exigeAprovacao,
      antecedenciaMinimaHoras: v.antecedenciaMinimaHoras,
      antecedenciaMaxDias: v.antecedenciaMaxDias,
      prazoDesistenciaHoras: v.prazoDesistenciaHoras,
      limitePorMes: v.limitePorMes,
      limitePorCasaPorDia: v.limitePorCasaPorDia,
      // Sem limite por dia, a opção "passar do limite" não faz sentido.
      permitirExtraSeDiaLivre: v.limitePorCasaPorDia !== null && v.permitirExtraSeDiaLivre,
      exigencias: v.exigencia,
      avisos: v.aviso,
      faixasLivres: normalizarFaixasLivres(livres),
      ativa: v.ativa,
      ordem: v.ordem,
      faixas: normalizarFaixas(faixas),
      responsavelUid: v.responsavelUid || null,
      fotos: v.fotos,
    };
  });

export type DadosArea = z.output<typeof esquemaArea>;

const data = z.string().refine(dataValida, "Escolha uma data válida.");
const faixaId = z.string().regex(/^\d{4}-\d{4}$/, "Escolha um horário.");
const observacao = z.string().trim().max(300, "Observação muito longa (máximo 300 caracteres).").default("");
const motivo = z.string().trim().min(3, "Explique o motivo (pelo menos 3 letras).").max(200, "Motivo muito longo.");

/** Pedido do morador (a casa vem do cadastro dele, nunca do formulário). */
export const esquemaPedido = z.object({
  areaId: idDocumento,
  data,
  faixaId,
  observacao,
  /** Caixa "Li e concordo com as regras" (o servidor exige quando a área tem exigências). */
  aceite: z
    .enum(["sim"])
    .optional()
    .transform((v) => v === "sim"),
});

/** Reserva feita pela administração para uma casa. */
export const esquemaReservaAdmin = z.object({
  areaId: idDocumento,
  data,
  faixaId,
  observacao,
  unitId: idDocumento.refine(Boolean, "Escolha a casa."),
});

/** Bloqueio de horário (manutenção, evento do condomínio...). */
export const esquemaBloqueio = z.object({ areaId: idDocumento, data, faixaId, motivo });

export const esquemaAprovar = z.object({ id: idDocumento });
export const esquemaRecusar = z.object({ id: idDocumento, motivo });

/** Cancelar: a administração precisa dar o motivo; para o morador ele é opcional. */
export const esquemaCancelar = z.object({
  id: idDocumento,
  motivo: z.string().trim().max(200, "Motivo muito longo.").default(""),
});
