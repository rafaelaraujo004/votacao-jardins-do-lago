/**
 * Áreas e equipamentos REAIS do Residencial Jardins do Lago, com as regras
 * passadas pela administração. Usado pelo script configurar-jardins-do-lago
 * (condomínio real) e pelos scripts de demonstração (mesmas regras, dados fictícios).
 *
 * Capacidade 0 = não informada (a tela não mostra "até N pessoas").
 * Limite por mês 0 = sem limite.
 */
import { normalizarFaixas, validarFaixas, validarFaixasLivres, type ConfigArea } from "./reservas";

const DESISTENCIA_24H = "Desistência com até 24 horas de antecedência; depois disso, sujeita a multa.";

export const AREAS_JARDINS_DO_LAGO: ConfigArea[] = [
  {
    id: "area-de-lazer",
    tipo: "area",
    nome: "Área de lazer (salão de festas, quiosques e churrasqueira)",
    regras:
      "Uso das 8h às 20h. Pedido com pelo menos 48 horas de antecedência e aprovação da administração. Uma reserva por casa por dia.",
    capacidade: 0,
    exigeAprovacao: true,
    antecedenciaMinimaHoras: 48,
    antecedenciaMaxDias: 60,
    prazoDesistenciaHoras: 24,
    limitePorMes: 0,
    limitePorCasaPorDia: 1,
    permitirExtraSeDiaLivre: false,
    exigencias: [
      "Ao ter o domínio do ambiente, entregar da mesma forma que lhe foi repassado.",
      "Grelhas da churrasqueira limpas (lavadas), assim como a churrasqueira sem resquícios de uso (limpa, sem carvão queimado).",
      "Banheiro limpo e lixo recolhido, com troca das sacolas.",
      "Recolher todo o material usado nas imediações do ambiente, principalmente nas lixeiras externas.",
      "Proibido som automotivo na área de lazer.",
      "A partir das 22h, guardar a paz, o sossego e o descanso dos demais moradores (só é tolerável o som ambiente).",
    ],
    avisos: [
      "Os quiosques e o salão de festas não têm mesas e cadeiras.",
      "O descumprimento destas regras gera multa.",
      DESISTENCIA_24H,
    ],
    faixasLivres: [],
    ativa: true,
    faixas: normalizarFaixas([{ rotulo: "Dia", inicio: "08:00", fim: "20:00" }]),
    ordem: 1,
  },
  {
    id: "quadra",
    tipo: "area",
    nome: "Quadra poliesportiva",
    regras:
      "Reserva de 1 hora, das 19h às 22h, sem precisar de aprovação. Das 17h às 19h o uso é livre para todos os moradores, sem reserva.",
    capacidade: 0,
    exigeAprovacao: false,
    antecedenciaMinimaHoras: 0,
    antecedenciaMaxDias: 14,
    prazoDesistenciaHoras: 0,
    limitePorMes: 0,
    limitePorCasaPorDia: 1,
    permitirExtraSeDiaLivre: true,
    exigencias: [],
    avisos: [
      "Cada morador pode reservar 1 hora por dia; se não houver outra reserva no mesmo dia, pode aumentar esse horário.",
      "O responsável pela reserva tem que estar presente no local; em caso de descumprimento serão tomadas as devidas medidas administrativas, conforme o regimento.",
    ],
    faixasLivres: [{ rotulo: "Uso livre para todos os moradores", inicio: "17:00", fim: "19:00" }],
    ativa: true,
    faixas: normalizarFaixas([
      { rotulo: "19h às 20h", inicio: "19:00", fim: "20:00" },
      { rotulo: "20h às 21h", inicio: "20:00", fim: "21:00" },
      { rotulo: "21h às 22h", inicio: "21:00", fim: "22:00" },
    ]),
    ordem: 2,
  },
  {
    id: "rocadeira",
    tipo: "equipamento",
    nome: "Roçadeira",
    regras: "Empréstimo por um dia, das 8h às 20h. Pedido com pelo menos 24 horas de antecedência e aprovação da administração.",
    capacidade: 1,
    exigeAprovacao: true,
    antecedenciaMinimaHoras: 24,
    antecedenciaMaxDias: 30,
    prazoDesistenciaHoras: 0, // o regimento só prevê multa por desistência para a área de lazer
    limitePorMes: 0,
    limitePorCasaPorDia: 1,
    permitirExtraSeDiaLivre: false,
    exigencias: [],
    avisos: [],
    faixasLivres: [],
    ativa: true,
    faixas: normalizarFaixas([{ rotulo: "Dia inteiro", inicio: "08:00", fim: "20:00" }]),
    ordem: 10,
  },
  {
    id: "carrinho-de-mao",
    tipo: "equipamento",
    nome: "Carrinho de mão",
    regras: "Empréstimo por um dia, das 8h às 20h. Pedido com pelo menos 24 horas de antecedência e aprovação da administração.",
    capacidade: 1,
    exigeAprovacao: true,
    antecedenciaMinimaHoras: 24,
    antecedenciaMaxDias: 30,
    prazoDesistenciaHoras: 0, // o regimento só prevê multa por desistência para a área de lazer
    limitePorMes: 0,
    limitePorCasaPorDia: 1,
    permitirExtraSeDiaLivre: false,
    exigencias: [],
    avisos: [],
    faixasLivres: [],
    ativa: true,
    faixas: normalizarFaixas([{ rotulo: "Dia inteiro", inicio: "08:00", fim: "20:00" }]),
    ordem: 11,
  },
];

/** Confere as faixas de todas as áreas (usado pelos scripts e pelos testes). Devolve os problemas encontrados. */
export function problemasDasAreasJardins(areas: ConfigArea[] = AREAS_JARDINS_DO_LAGO): string[] {
  const problemas: string[] = [];
  for (const a of areas) {
    const p1 = validarFaixas(a.faixas);
    if (p1) problemas.push(`${a.id}: ${p1}`);
    const p2 = validarFaixasLivres(a.faixasLivres, a.faixas);
    if (p2) problemas.push(`${a.id}: ${p2}`);
  }
  return problemas;
}
