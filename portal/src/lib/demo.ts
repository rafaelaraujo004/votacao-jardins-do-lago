/**
 * Dados de DEMONSTRAÇÃO (fictícios). Usados só no simulador local.
 * Nenhum nome, casa ou valor aqui é real.
 */
import type { Papel } from "./permissoes";

export const CONDOMINIO_DEMO = {
  id: "jardins-do-lago-demo",
  nome: "Jardins do Lago — DEMONSTRAÇÃO",
};

/** Um segundo condomínio fictício, usado para provar o isolamento entre condomínios. */
export const OUTRO_CONDOMINIO_DEMO = {
  id: "condominio-vizinho-demo",
  nome: "Condomínio Vizinho — DEMONSTRAÇÃO",
};

export type UsuarioDemo = {
  uid: string;
  nome: string;
  papel: Papel;
  unitId: string | null;
  descricao: string;
};

export const USUARIOS_DEMO: Record<Papel, UsuarioDemo> = {
  morador: {
    uid: "demo-morador",
    nome: "Ana Demonstração",
    papel: "morador",
    unitId: "casa-012",
    descricao: "Vê o início do morador, com os atalhos.",
  },
  portaria: {
    uid: "demo-portaria",
    nome: "Carlos Demonstração",
    papel: "portaria",
    unitId: null,
    descricao: "Vê a tela de trabalho da portaria.",
  },
  admin: {
    uid: "demo-sindico",
    nome: "José Demonstração",
    papel: "admin",
    unitId: null,
    descricao: "Vê o painel completo e a auditoria.",
  },
  conselheiro: {
    uid: "demo-conselheiro",
    nome: "Marta Demonstração",
    papel: "conselheiro",
    unitId: null,
    descricao: "Vê o painel só para consulta.",
  },
};
