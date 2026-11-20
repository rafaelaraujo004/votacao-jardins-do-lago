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
  reservas: {
    uid: "demo-reservas",
    nome: "Shirley Demonstração",
    papel: "reservas",
    unitId: null,
    descricao: "Responsável pelas reservas: aprova ou recusa os pedidos.",
  },
};

/**
 * Usuário fixo do MORADOR demo (Casa 12), para entrar com "Sou morador".
 * Precisa seguir as regras do usuário (src/lib/usuario-morador.ts): 6 caracteres,
 * sem 0, O, 1 e I. Por isso não dá para usar "DEMO12" (tem O e 1).
 */
export const USUARIO_MORADOR_DEMO = "DEMA22";

/** Informações fictícias do condomínio demo (telefones de mentira, só para a tela). */
export const INFORMACOES_DEMO = {
  telefonePortaria: "94900000001",
  telefoneAdministracao: "9430000002",
  whatsappAdministracao: "94900000003",
  horarioAdministracao: "Segunda a sexta, das 8h às 17h",
  aviso: "Demonstração: os telefones e dados desta página são fictícios.",
  // CNPJ de exemplo (dígitos válidos, de livros e manuais), não é de nenhum condomínio.
  pix: { tipo: "cnpj", chave: "11222333000181", favorecido: "Residencial Jardins do Lago (demonstração)" },
  telefoneRonda: "94900000004",
  responsavelReservas: { nome: "Responsável (demo)", telefone: "94900000005", horario: "8h às 20h" },
  linkVotacao: "https://example.com/votacao-demo",
} as const;
