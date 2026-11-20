/**
 * LINKS DOS MÓDULOS (lógica pura, testada em tests/unit/modulos.test.ts).
 *
 * Cada parte do portal tem um link curto e fácil de mandar pelo WhatsApp:
 *   /sindico  /conselho  /portaria  /morador  /reservas  /visitas  /encomendas
 *   /financeiro  /comunicados  /solicitacoes  /documentos  /enquetes  /votacao  /classificados
 *   /notificacoes  /mapa  /contatos
 *
 * O MESMO link serve para todo mundo: cada pessoa cai na versão do módulo do SEU perfil.
 * Ex.: /reservas → morador: pedir reserva; síndico: agenda e aprovações; portaria: tela da portaria.
 * Sem login, a pessoa entra primeiro e depois segue para o módulo.
 */
import type { Papel, Permissao } from "./permissoes";
import { sufixoDoId } from "./condominio-id";

/** As três "áreas" do portal. Síndico e conselho usam a mesma (gestão). */
export type Grupo = "morador" | "portaria" | "gestao";

export function grupoDoPapel(papel: Papel): Grupo {
  if (papel === "morador") return "morador";
  if (papel === "portaria") return "portaria";
  return "gestao";
}

/** Para onde o módulo leva cada área (e a permissão que a tela exige). */
type Destino = { href: string; permissao: Permissao };

export type Modulo = {
  chave: string;
  nome: string;
  /** Link curto: o que vai no WhatsApp. */
  link: string;
  /** Para que serve, em uma frase. */
  descricao: string;
  /** Quem costuma receber o link (só para organizar a tela de links). */
  para: "equipe" | "moradores";
  /** Nome do ícone (lucide). */
  icone: string;
  destinos: Partial<Record<Grupo, Destino>>;
  /** Outros caminhos que também são deste módulo. */
  caminhos?: string[];
  /** As telas de detalhe têm o mesmo formato nas áreas (ex.: /comunicados/ID ↔ /admin/comunicados/ID). */
  detalhe?: boolean;
};

export const MODULOS: readonly Modulo[] = [
  {
    chave: "sindico",
    nome: "Painel do síndico",
    link: "/sindico",
    descricao: "Painel completo da administração: pessoas, contas, reservas, comunicados e mais.",
    para: "equipe",
    icone: "LayoutDashboard",
    destinos: { gestao: { href: "/admin", permissao: "area.gestao" } },
  },
  {
    chave: "conselho",
    nome: "Painel do conselho",
    link: "/conselho",
    descricao: "O painel da administração para consulta: contas, relatórios e reservas.",
    para: "equipe",
    icone: "ShieldCheck",
    destinos: { gestao: { href: "/admin", permissao: "area.gestao" } },
  },
  {
    chave: "portaria",
    nome: "Portaria",
    link: "/portaria",
    descricao: "Tela de trabalho do porteiro: validar códigos, entradas e saídas, encomendas.",
    para: "equipe",
    icone: "DoorOpen",
    destinos: {
      portaria: { href: "/portaria", permissao: "portaria.operar" },
      gestao: { href: "/admin/portaria", permissao: "visitantes.ver_todos" },
      morador: { href: "/visitas", permissao: "visitantes.autorizar" },
    },
  },
  {
    chave: "morador",
    nome: "Portal do morador",
    link: "/morador",
    descricao: "Início do morador, com todos os atalhos da casa.",
    para: "moradores",
    icone: "House",
    destinos: {
      morador: { href: "/inicio", permissao: "area.morador" },
      portaria: { href: "/portaria", permissao: "area.portaria" },
      gestao: { href: "/admin", permissao: "area.gestao" },
    },
    caminhos: ["/mais"],
  },
  {
    chave: "reservas",
    nome: "Reservas",
    link: "/reservas",
    descricao: "Agenda da área de lazer, da quadra e dos equipamentos.",
    para: "moradores",
    icone: "CalendarDays",
    destinos: {
      morador: { href: "/reservas", permissao: "area.morador" },
      portaria: { href: "/portaria", permissao: "portaria.operar" },
      gestao: { href: "/admin/reservas", permissao: "reservas.ver_todas" },
    },
  },
  {
    chave: "visitas",
    nome: "Visitas",
    link: "/visitas",
    descricao: "Autorizar visitantes e prestadores com um código para a portaria.",
    para: "moradores",
    icone: "UserCheck",
    destinos: {
      morador: { href: "/visitas", permissao: "visitantes.autorizar" },
      portaria: { href: "/portaria", permissao: "portaria.operar" },
      gestao: { href: "/admin/portaria", permissao: "visitantes.ver_todos" },
    },
  },
  {
    chave: "encomendas",
    nome: "Encomendas",
    link: "/encomendas",
    descricao: "Encomendas que chegaram na portaria para a casa.",
    para: "moradores",
    icone: "Package",
    destinos: {
      morador: { href: "/encomendas", permissao: "encomendas.ver_proprias" },
      portaria: { href: "/portaria", permissao: "encomendas.registrar" },
      gestao: { href: "/admin/portaria", permissao: "visitantes.ver_todos" },
    },
  },
  {
    chave: "financeiro",
    nome: "Contas do condomínio",
    link: "/financeiro",
    descricao: "Prestação de contas: entradas, saídas e saldo de cada mês.",
    para: "moradores",
    icone: "Landmark",
    destinos: {
      morador: { href: "/financeiro", permissao: "financeiro.ver_publicado" },
      gestao: { href: "/admin/financeiro", permissao: "financeiro.ver" },
    },
  },
  {
    chave: "comunicados",
    nome: "Comunicados",
    link: "/comunicados",
    descricao: "Avisos da administração para todos os moradores.",
    para: "moradores",
    icone: "Megaphone",
    destinos: {
      morador: { href: "/comunicados", permissao: "comunicados.ver" },
      portaria: { href: "/portaria/comunicados", permissao: "comunicados.ver" },
      gestao: { href: "/admin/comunicados", permissao: "comunicados.ver" },
    },
    detalhe: true,
  },
  {
    chave: "solicitacoes",
    nome: "Solicitações",
    link: "/solicitacoes",
    descricao: "Informar problemas e acompanhar os pedidos pelo número do protocolo.",
    para: "moradores",
    icone: "ClipboardList",
    destinos: {
      morador: { href: "/solicitacoes", permissao: "solicitacoes.abrir" },
      gestao: { href: "/admin/solicitacoes", permissao: "solicitacoes.gerenciar" },
    },
    detalhe: true,
  },
  {
    chave: "documentos",
    nome: "Documentos",
    link: "/documentos",
    descricao: "Regimento, atas, convenção e outros documentos do condomínio.",
    para: "moradores",
    icone: "FolderOpen",
    destinos: {
      morador: { href: "/documentos", permissao: "documentos.ver" },
      gestao: { href: "/admin/documentos", permissao: "documentos.ver" },
    },
  },
  {
    chave: "enquetes",
    nome: "Enquetes",
    link: "/enquetes",
    descricao: "Opinar nas enquetes do condomínio (um voto por casa).",
    para: "moradores",
    icone: "Vote",
    destinos: {
      morador: { href: "/enquetes", permissao: "enquetes.votar" },
      gestao: { href: "/admin/enquetes", permissao: "enquetes.gerenciar" },
    },
    detalhe: true,
  },
  {
    chave: "votacao",
    nome: "Votação oficial",
    link: "/votacao",
    descricao: "Eleição do condomínio com voto secreto (um voto por casa).",
    para: "moradores",
    icone: "Vote",
    destinos: {
      morador: { href: "/votacao", permissao: "eleicoes.votar" },
      gestao: { href: "/admin/votacao", permissao: "eleicoes.gerenciar" },
    },
    detalhe: true,
  },
  {
    chave: "classificados",
    nome: "Classificados",
    link: "/classificados",
    descricao: "Compra, venda e serviços entre vizinhos.",
    para: "moradores",
    icone: "Store",
    destinos: {
      morador: { href: "/classificados", permissao: "classificados.usar" },
      gestao: { href: "/admin/classificados", permissao: "classificados.moderar" },
    },
  },
  {
    chave: "notificacoes",
    nome: "Notificações",
    link: "/notificacoes",
    descricao: "O sino: votações, enquetes, comunicados e respostas aos pedidos (equipe: o que espera aprovação; portaria: visitas autorizadas).",
    para: "moradores",
    icone: "Bell",
    destinos: {
      morador: { href: "/notificacoes", permissao: "area.morador" },
      portaria: { href: "/portaria/notificacoes", permissao: "area.portaria" },
      gestao: { href: "/admin/notificacoes", permissao: "area.gestao" },
    },
  },
  {
    chave: "mapa",
    nome: "Mapa das casas",
    link: "/mapa",
    descricao: "Planta do condomínio com os 225 lotes.",
    para: "moradores",
    icone: "Map",
    destinos: { morador: { href: "/mapa", permissao: "mapa.ver" } },
  },
  {
    chave: "contatos",
    nome: "Contatos e informações",
    link: "/contatos",
    descricao: "Telefones úteis, ronda noturna, PIX da taxa e responsável pelas reservas.",
    para: "moradores",
    icone: "Phone",
    destinos: {
      morador: { href: "/contatos", permissao: "informacoes.ver" },
      gestao: { href: "/admin/informacoes", permissao: "informacoes.gerenciar" },
    },
  },
];

/** Cabeçalho em que o src/proxy.ts anota o caminho pedido (o servidor usa para achar o módulo). */
export const CABECALHO_CAMINHO = "x-portal-caminho";

/** Os links curtos que não são telas (só encaminham): /sindico, /conselho e /morador. */
export const LINKS_SO_DE_ENTRADA = ["/sindico", "/conselho", "/morador"] as const;

function dentroDe(caminho: string, base: string): boolean {
  return caminho === base || caminho.startsWith(`${base}/`);
}

function caminhosDo(m: Modulo): string[] {
  return [m.link, ...Object.values(m.destinos).map((d) => d.href), ...(m.caminhos ?? [])];
}

/**
 * De qual módulo é o caminho. O caminho mais específico vence; no empate, vence o módulo
 * cujo LINK é esse caminho (ex.: "/visitas" é do módulo Visitas, não da Portaria) e depois
 * o primeiro da lista. "/admin" sozinho é do painel; "/admin/auditoria" não é de nenhum.
 */
export function moduloDoCaminho(caminho: string): Modulo | null {
  let melhor: { m: Modulo; pontos: number } | null = null;
  for (const m of MODULOS) {
    for (const base of caminhosDo(m)) {
      // "/admin" só vale exato: as subpáginas do painel sem módulo (ex.: auditoria) ficam de fora.
      const casa = base === "/admin" ? caminho === "/admin" : dentroDe(caminho, base);
      const pontos = base.length * 2 + (base === m.link ? 1 : 0);
      if (casa && (!melhor || pontos > melhor.pontos)) melhor = { m, pontos };
    }
  }
  return melhor?.m ?? null;
}

export function moduloPeloLink(link: string): Modulo | null {
  return MODULOS.find((m) => m.link === link) ?? null;
}

/** Palavras que aparecem depois do módulo mas NÃO são o número de um item. */
const NAO_SAO_ITENS = new Set(["nova", "novo", "editar", "areas", "moderar", "csv"]);
const REGEX_ITEM = /^[A-Za-z0-9_-]{1,64}$/;

/**
 * Para onde o módulo leva esta pessoa (null = o módulo não tem versão para o perfil dela).
 * Telas de detalhe com o mesmo formato levam o item junto
 * (ex.: síndico abrindo /comunicados/abc → /admin/comunicados/abc).
 */
export function destinoDoModulo(
  modulo: Modulo,
  papel: Papel,
  permissoes: ReadonlySet<Permissao> | null,
  caminho?: string,
): string | null {
  return destinoNaArea(modulo, grupoDoPapel(papel), permissoes, caminho);
}

/** Igual a destinoDoModulo, a partir da área (usado logo depois do login, sem as permissões). */
export function destinoNaArea(
  modulo: Modulo,
  grupo: Grupo,
  permissoes: ReadonlySet<Permissao> | null,
  caminho?: string,
): string | null {
  const destino = modulo.destinos[grupo];
  if (!destino) return null;
  if (permissoes && !permissoes.has(destino.permissao)) return null;
  if (modulo.detalhe && caminho) {
    for (const d of Object.values(modulo.destinos)) {
      if (!caminho.startsWith(`${d.href}/`)) continue;
      const resto = caminho.slice(d.href.length + 1);
      if (REGEX_ITEM.test(resto) && !NAO_SAO_ITENS.has(resto)) return `${destino.href}/${resto}`;
    }
  }
  return destino.href;
}

/**
 * Quem abriu uma tela de OUTRA área (ex.: o síndico abriu o link /reservas, que é a tela do
 * morador): para onde mandar. null = não há versão desse módulo para a pessoa
 * (ou ela já está nela).
 */
export function telaEquivalente(caminho: string, papel: Papel, permissoes: ReadonlySet<Permissao>): string | null {
  const modulo = moduloDoCaminho(caminho);
  if (!modulo) return null;
  const destino = destinoDoModulo(modulo, papel, permissoes, caminho);
  if (!destino || dentroDe(caminho, destino.split(/[?#]/)[0])) return null;
  return destino;
}

/** Aba que já começa marcada na tela de entrada para quem veio por este caminho. */
export function abaDaEntrada(caminho: string): "morador" | "equipe" {
  if (dentroDe(caminho, "/admin")) return "equipe";
  const modulo = moduloDoCaminho(caminho);
  return modulo?.para === "equipe" ? "equipe" : "morador";
}

/** Nome de cada área para quem lê a tela de links. */
export const NOME_DA_AREA: Record<Grupo, string> = {
  morador: "Moradores",
  portaria: "Portaria",
  gestao: "Síndico e conselho",
};

/**
 * Link completo do módulo para mandar às pessoas: "<base>/reservas"
 * (+ "?c=<id>" quando não é o condomínio padrão, para o login do morador).
 */
export function linkDoModulo(base: string, modulo: Modulo, condominioId: string, padrao: string): string {
  return `${base.replace(/\/+$/, "")}${modulo.link}${sufixoDoId(condominioId, padrao)}`;
}

/** Mensagem pronta para o WhatsApp com o link de um módulo. */
export function mensagemDoModulo(nomeCondominio: string, modulo: Modulo, link: string): string {
  return [
    `*${modulo.nome}* · Portal do ${nomeCondominio}`,
    modulo.descricao,
    link,
    "Entre com o seu usuário e a sua senha. Não passe a sua senha para ninguém.",
  ].join("\n\n");
}
