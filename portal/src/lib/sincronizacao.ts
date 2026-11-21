/**
 * SINCRONIZAÇÃO ENTRE AS TELAS (lógica pura, testada em tests/unit/sincronizacao.test.ts).
 *
 * Como funciona, em linguagem simples:
 * 1. Toda alteração do portal passa pela auditoria (src/server/auditoria.ts). Junto com ela,
 *    na MESMA gravação, o servidor marca "o módulo X mudou agora" num documento pequeno:
 *    condominiums/{c}/sistema/sinais.
 * 2. Cada tela aberta pergunta, de tempos em tempos, só esse documento (GET /api/sinais).
 * 3. Se mudou um módulo que a tela mostra, a tela se atualiza sozinha. Assim o morador
 *    autoriza uma visita e a portaria vê na hora, sem ninguém apertar "recarregar".
 */
import type { AcaoAuditada } from "@/server/auditoria";

export const MODULOS_SINC = [
  "portaria", // visitas, entradas e saídas, encomendas
  "reservas", // reservas e áreas de lazer
  "financeiro",
  "comunicados",
  "solicitacoes",
  "documentos",
  "enquetes",
  "eleicoes",
  "classificados",
  "pessoas", // unidades, moradores, equipe e acessos
  "informacoes", // contatos, aviso, PIX, ronda
] as const;
export type ModuloSinc = (typeof MODULOS_SINC)[number];

/**
 * Evento que o <Sincronizar> dispara na janela quando módulos mudam
 * (detalhe: { modulos }). O sino de notificações escuta para se atualizar.
 */
export const EVENTO_SINAIS = "portal:sinais";

/** Sinais: para cada módulo, quando foi a última mudança (milissegundos). */
export type Sinais = Partial<Record<ModuloSinc, number>>;

/**
 * Qual módulo cada ação da auditoria altera. `null` = não muda o que as telas mostram
 * (ex.: entrar e sair). O TypeScript obriga a listar TODAS as ações.
 */
export const MODULO_DA_ACAO: Record<AcaoAuditada, ModuloSinc | null> = {
  "sessao.entrar": null,
  "sessao.sair": null,
  "acesso.criar_senha": "pessoas",
  "acesso.criar_morador": "pessoas",
  "acesso.remover_morador": "pessoas",
  "acesso.redefinir_senha": "pessoas",
  "acesso.trocar_senha": "pessoas",
  "condominio.criar": null,
  "membro.criar": "pessoas",
  "membro.alterar": "pessoas",
  "membro.permissoes": "pessoas",
  "membro.suspender": "pessoas",
  "membro.reativar": "pessoas",
  "membro.excluir": "pessoas",
  "membro.importar": "pessoas",
  "unidade.criar": "pessoas",
  "unidade.alterar": "pessoas",
  "admin.alterar": "pessoas",
  "financeiro.lancar": "financeiro",
  "financeiro.estornar": "financeiro",
  "financeiro.publicar": "financeiro",
  "financeiro.configurar": "financeiro",
  "financeiro.categoria": "financeiro",
  "financeiro.quadro": "financeiro",
  "financeiro.comprovante": "financeiro",
  "informacoes.alterar": "informacoes",
  "visitante.autorizar": "portaria",
  "visitante.cancelar": "portaria",
  "visitante.anonimizar": "portaria",
  "acesso.entrada": "portaria",
  "acesso.saida": "portaria",
  "encomenda.registrar": "portaria",
  "encomenda.entregar": "portaria",
  "reserva.criar": "reservas",
  "reserva.cancelar": "reservas",
  "reserva.aprovar": "reservas",
  "reserva.recusar": "reservas",
  "reserva.bloquear": "reservas",
  "area.criar": "reservas",
  "area.editar": "reservas",
  "comunicado.criar": "comunicados",
  "comunicado.editar": "comunicados",
  "comunicado.publicar": "comunicados",
  "comunicado.arquivar": "comunicados",
  "solicitacao.abrir": "solicitacoes",
  "solicitacao.comentar": "solicitacoes",
  "solicitacao.status": "solicitacoes",
  "solicitacao.cancelar": "solicitacoes",
  "documento.criar": "documentos",
  "documento.editar": "documentos",
  "documento.desativar": "documentos",
  "enquete.criar": "enquetes",
  "enquete.editar": "enquetes",
  "enquete.publicar": "enquetes",
  "enquete.encerrar": "enquetes",
  "enquete.votar": "enquetes",
  "eleicao.criar": "eleicoes",
  "eleicao.editar": "eleicoes",
  "eleicao.publicar": "eleicoes",
  "eleicao.rascunho": "eleicoes",
  "eleicao.votar": "eleicoes",
  "eleicao.bloqueio": "eleicoes",
  "eleicao.links": "eleicoes",
  "eleicao.contatos": "eleicoes",
  "eleicao.foto": "eleicoes",
  "eleicao.resultado": "eleicoes",
  "eleicao.assinatura": "eleicoes",
  "classificado.criar": "classificados",
  "classificado.editar": "classificados",
  "classificado.aprovar": "classificados",
  "classificado.rejeitar": "classificados",
  "classificado.remover": "classificados",
};

/**
 * Quais módulos cada tela mostra. Telas de resumo (início do morador, painel do síndico,
 * relatórios, auditoria) e qualquer tela que não esteja aqui acompanham TODOS os módulos.
 * Vale o caminho mais específico (ex.: "/admin/reservas" antes de "/admin").
 */
const TELAS: [caminho: string, modulos: ModuloSinc[]][] = [
  // Equipe
  ["/portaria", ["portaria", "pessoas", "comunicados", "informacoes"]],
  ["/admin/portaria", ["portaria"]],
  ["/admin/reservas", ["reservas"]],
  ["/admin/financeiro", ["financeiro"]],
  ["/admin/comunicados", ["comunicados"]],
  ["/admin/solicitacoes", ["solicitacoes"]],
  ["/admin/documentos", ["documentos"]],
  ["/admin/enquetes", ["enquetes"]],
  ["/admin/votacao", ["eleicoes"]],
  ["/admin/classificados", ["classificados"]],
  ["/admin/pessoas", ["pessoas"]],
  ["/admin/informacoes", ["informacoes"]],
  ["/admin/notificacoes", ["classificados", "reservas", "solicitacoes"]],
  // Morador
  ["/visitas", ["portaria"]],
  ["/encomendas", ["portaria"]],
  ["/reservas", ["reservas", "informacoes"]],
  ["/financeiro", ["financeiro", "informacoes"]],
  ["/comunicados", ["comunicados"]],
  ["/solicitacoes", ["solicitacoes"]],
  ["/documentos", ["documentos"]],
  ["/enquetes", ["enquetes"]],
  ["/votacao", ["eleicoes"]],
  ["/classificados", ["classificados"]],
  ["/notificacoes", ["classificados", "reservas", "solicitacoes", "eleicoes", "enquetes", "comunicados", "documentos"]],
  ["/contatos", ["informacoes"]],
  ["/mapa", ["pessoas"]],
];

function dentroDe(caminho: string, base: string): boolean {
  return caminho === base || caminho.startsWith(`${base}/`);
}

/** Módulos que a tela do `caminho` mostra (ex.: "/admin/reservas/areas" → ["reservas"]). */
export function modulosDaTela(caminho: string): readonly ModuloSinc[] {
  let melhor: [string, ModuloSinc[]] | null = null;
  for (const item of TELAS) {
    if (dentroDe(caminho, item[0]) && (!melhor || item[0].length > melhor[0].length)) melhor = item;
  }
  return melhor ? melhor[1] : MODULOS_SINC;
}

/** Hora em que a tela foi montada no servidor (vai para o componente Sincronizar). */
export function horaDaMontagem(): number {
  return Date.now();
}

/** Aceita só números de módulos conhecidos (o que vier diferente é ignorado). */
export function lerSinais(bruto: unknown): Sinais {
  const sinais: Sinais = {};
  if (!bruto || typeof bruto !== "object") return sinais;
  for (const m of MODULOS_SINC) {
    const v = (bruto as Record<string, unknown>)[m];
    if (typeof v === "number" && Number.isFinite(v) && v > 0) sinais[m] = v;
  }
  return sinais;
}

/**
 * Folga para a diferença de relógio entre o servidor do portal e o do banco.
 * Uma mudança gravada até 2 s ANTES de a tela ser montada ainda conta como "talvez não vista".
 */
export const FOLGA_RELOGIO_MS = 2000;

/**
 * Compara os sinais novos com os anteriores e diz o que mudou.
 * - `anteriores` null = primeira consulta da tela: compara com a hora em que a tela foi montada
 *   no servidor (`montadaEm`), com a folga do relógio.
 */
export function modulosQueMudaram(anteriores: Sinais | null, novos: Sinais, montadaEm: number): ModuloSinc[] {
  const mudaram: ModuloSinc[] = [];
  for (const m of MODULOS_SINC) {
    const novo = novos[m];
    if (novo === undefined) continue;
    const referencia = anteriores ? (anteriores[m] ?? 0) : montadaEm - FOLGA_RELOGIO_MS;
    if (novo > referencia) mudaram.push(m);
  }
  return mudaram;
}
