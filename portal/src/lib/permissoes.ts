/**
 * Matriz de permissões do portal.
 *
 * Cada pessoa tem um PAPEL (morador, portaria, admin, conselheiro, reservas). O papel
 * dá um conjunto padrão de permissões. O admin pode, por pessoa:
 *  - ACRESCENTAR permissões extras (só as que cabem no "teto" do papel);
 *  - RETIRAR permissões (a retirada sempre vence).
 *
 * Esta é a única fonte da verdade usada pelo servidor. As regras do
 * Firestore espelham o essencial (papel + unidade) como segunda barreira.
 */

export const PAPEIS = ["morador", "portaria", "admin", "conselheiro", "reservas"] as const;
export type Papel = (typeof PAPEIS)[number];

export const PERMISSOES = [
  // áreas do sistema
  "area.morador",
  "area.portaria",
  "area.gestao",
  // financeiro
  "financeiro.ver_publicado",
  "financeiro.ver",
  "financeiro.lancar",
  "financeiro.publicar",
  "relatorios.ver",
  // pessoas e cadastros
  "unidades.ver",
  "unidades.gerenciar",
  "moradores.ver",
  "moradores.gerenciar",
  "equipe.gerenciar",
  "permissoes.gerenciar",
  // portaria
  "visitantes.autorizar",
  "visitantes.ver_todos",
  "portaria.operar",
  "encomendas.registrar",
  "encomendas.ver_proprias",
  // reservas
  "reservas.fazer",
  "reservas.ver_todas",
  "reservas.gerenciar",
  "areas.configurar",
  // comunicação e serviços
  "comunicados.ver",
  "comunicados.publicar",
  "solicitacoes.abrir",
  "solicitacoes.gerenciar",
  "documentos.ver",
  "documentos.gerenciar",
  "enquetes.votar",
  "enquetes.gerenciar",
  "eleicoes.votar",
  "eleicoes.gerenciar",
  "classificados.usar",
  "classificados.moderar",
  "mapa.ver",
  "mapa.configurar",
  "informacoes.ver",
  "informacoes.gerenciar",
  // controle
  "auditoria.ver",
] as const;
export type Permissao = (typeof PERMISSOES)[number];

const PADRAO_MORADOR: Permissao[] = [
  "area.morador",
  "financeiro.ver_publicado",
  "visitantes.autorizar",
  "encomendas.ver_proprias",
  "reservas.fazer",
  "comunicados.ver",
  "solicitacoes.abrir",
  "documentos.ver",
  "enquetes.votar",
  "eleicoes.votar",
  "classificados.usar",
  "mapa.ver",
  "informacoes.ver",
];

const PADRAO_PORTARIA: Permissao[] = [
  "area.portaria",
  "portaria.operar",
  "visitantes.ver_todos",
  "encomendas.registrar",
  // Sem "reservas.ver_todas": a portaria não precisa ver as reservas (decisão de 21/11/2026).
  "unidades.ver",
  "comunicados.ver",
  "documentos.ver",
  "mapa.ver",
  "informacoes.ver",
];

const PADRAO_CONSELHEIRO: Permissao[] = [
  "area.gestao",
  "financeiro.ver_publicado",
  "financeiro.ver",
  "relatorios.ver",
  "unidades.ver",
  "reservas.ver_todas",
  "comunicados.ver",
  "documentos.ver",
  "mapa.ver",
  "informacoes.ver",
];

/**
 * Responsável pelas reservas (ex.: a pessoa que cuida da área de lazer): acesso de
 * EQUIPE (e-mail e senha) que só vê a agenda de reservas e aprova ou recusa os pedidos.
 * Recebe no sino os pedidos das áreas em que o síndico a marcou como responsável
 * (sem responsável escolhido, os pedidos da área vão para o síndico).
 */
const PADRAO_RESERVAS: Permissao[] = ["area.gestao", "reservas.ver_todas", "reservas.gerenciar"];

/** O admin (síndico) tem tudo. */
const PADRAO_ADMIN: Permissao[] = [...PERMISSOES];

export const PERMISSOES_PADRAO: Record<Papel, readonly Permissao[]> = {
  morador: PADRAO_MORADOR,
  portaria: PADRAO_PORTARIA,
  conselheiro: PADRAO_CONSELHEIRO,
  admin: PADRAO_ADMIN,
  reservas: PADRAO_RESERVAS,
};

/**
 * Teto: o máximo que um papel pode receber como extra.
 * Ex.: a portaria NUNCA recebe nada do financeiro, da auditoria nem de
 * permissões, mesmo que alguém tente conceder.
 */
export const TETO_EXTRAS: Record<Papel, readonly Permissao[]> = {
  morador: ["classificados.moderar"],
  portaria: ["reservas.gerenciar", "comunicados.publicar", "informacoes.gerenciar"],
  conselheiro: [
    "auditoria.ver",
    "comunicados.publicar",
    "documentos.gerenciar",
    "enquetes.gerenciar",
    "eleicoes.gerenciar",
    "solicitacoes.gerenciar",
    "moradores.ver",
  ],
  admin: PADRAO_ADMIN,
  reservas: ["areas.configurar", "informacoes.ver"],
};

export function ehPapel(valor: unknown): valor is Papel {
  return typeof valor === "string" && (PAPEIS as readonly string[]).includes(valor);
}

export function ehPermissao(valor: unknown): valor is Permissao {
  return typeof valor === "string" && (PERMISSOES as readonly string[]).includes(valor);
}

/**
 * Calcula as permissões efetivas de uma pessoa.
 * Valores desconhecidos (lixo no banco) são ignorados.
 */
export function calcularPermissoes(
  papel: Papel,
  extras: readonly unknown[] = [],
  negadas: readonly unknown[] = [],
): Set<Permissao> {
  const resultado = new Set<Permissao>(PERMISSOES_PADRAO[papel]);
  const teto = new Set<Permissao>(TETO_EXTRAS[papel]);

  for (const p of extras) {
    if (ehPermissao(p) && teto.has(p)) resultado.add(p);
  }
  for (const p of negadas) {
    if (ehPermissao(p)) resultado.delete(p);
  }
  return resultado;
}

/** Nome de cada permissão em linguagem simples (tela de permissões). */
export const DESCRICAO_PERMISSAO: Record<Permissao, string> = {
  "area.morador": "Usar a área do morador",
  "area.portaria": "Usar a tela da portaria",
  "area.gestao": "Usar o painel da administração",
  "financeiro.ver_publicado": "Ver a prestação de contas publicada",
  "financeiro.ver": "Ver todo o financeiro, inclusive o não publicado",
  "financeiro.lancar": "Lançar receitas, despesas e estornos",
  "financeiro.publicar": "Publicar a prestação de contas do mês",
  "relatorios.ver": "Ver e exportar relatórios",
  "unidades.ver": "Ver as unidades",
  "unidades.gerenciar": "Cadastrar e alterar unidades",
  "moradores.ver": "Ver o cadastro de moradores",
  "moradores.gerenciar": "Cadastrar, alterar e suspender moradores",
  "equipe.gerenciar": "Cadastrar portaria, conselho e administração",
  "permissoes.gerenciar": "Alterar permissões de outras pessoas",
  "visitantes.autorizar": "Autorizar visitantes",
  "visitantes.ver_todos": "Ver todos os visitantes autorizados",
  "portaria.operar": "Registrar entradas e saídas",
  "encomendas.registrar": "Registrar encomendas",
  "encomendas.ver_proprias": "Ver as próprias encomendas",
  "reservas.fazer": "Reservar áreas de lazer",
  "reservas.ver_todas": "Ver todas as reservas",
  "reservas.gerenciar": "Aprovar e cancelar reservas",
  "areas.configurar": "Configurar áreas de lazer",
  "comunicados.ver": "Ver comunicados",
  "comunicados.publicar": "Publicar comunicados",
  "solicitacoes.abrir": "Informar problemas e abrir solicitações",
  "solicitacoes.gerenciar": "Atender solicitações",
  "documentos.ver": "Ver documentos",
  "documentos.gerenciar": "Publicar documentos",
  "enquetes.votar": "Participar de enquetes",
  "enquetes.gerenciar": "Criar enquetes",
  "eleicoes.votar": "Votar na eleição oficial (voto secreto)",
  "eleicoes.gerenciar": "Organizar a eleição oficial (comissão eleitoral)",
  "classificados.usar": "Anunciar nos classificados",
  "classificados.moderar": "Moderar classificados",
  "mapa.ver": "Ver o mapa",
  "mapa.configurar": "Configurar o mapa",
  "informacoes.ver": "Ver contatos e informações úteis",
  "informacoes.gerenciar": "Alterar contatos e informações úteis",
  "auditoria.ver": "Ver a auditoria",
};

export const NOME_DO_PAPEL: Record<Papel, string> = {
  morador: "Morador",
  portaria: "Portaria",
  admin: "Síndico / Administração",
  conselheiro: "Conselho",
  reservas: "Responsável pelas reservas",
};

/** Para onde cada papel vai depois de entrar. */
export function inicioDoPapel(papel: Papel): string {
  switch (papel) {
    case "morador":
      return "/inicio";
    case "portaria":
      return "/portaria";
    case "admin":
    case "conselheiro":
      return "/admin";
    case "reservas":
      return "/admin/reservas";
  }
}
