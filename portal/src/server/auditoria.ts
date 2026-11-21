import "server-only";
import {
  FieldValue,
  type Firestore,
  type Transaction,
  type WriteBatch,
} from "firebase-admin/firestore";
import { marcarMudanca } from "./sinais";
import { MODULO_DA_ACAO } from "@/lib/sincronizacao";

/**
 * Registro de auditoria: quem fez, em qual condomínio, o quê e quando.
 *
 * - Deve ser gravado NA MESMA transação/lote da alteração: ou os dois
 *   acontecem, ou nenhum acontece.
 * - Ninguém altera ou apaga: as regras do Firestore negam, e o servidor só
 *   usa `create` (que falha se o documento já existir).
 * - Junto, marca o "sinal de mudança" do módulo (src/server/sinais.ts), que faz as
 *   telas abertas das outras pessoas se atualizarem sozinhas.
 */
export const ACOES_AUDITADAS = [
  "sessao.entrar",
  "sessao.sair",
  "acesso.criar_senha",
  "acesso.criar_morador",
  "acesso.remover_morador",
  "acesso.redefinir_senha",
  "acesso.trocar_senha",
  "condominio.criar",
  "membro.criar",
  "membro.alterar",
  "membro.permissoes",
  "membro.suspender",
  "membro.reativar",
  "membro.excluir",
  "membro.importar",
  "unidade.criar",
  "unidade.alterar",
  "financeiro.lancar",
  "financeiro.estornar",
  "financeiro.publicar",
  "financeiro.configurar",
  "financeiro.categoria",
  "financeiro.quadro",
  "financeiro.comprovante",
  "informacoes.alterar",
  "visitante.autorizar",
  "visitante.cancelar",
  "acesso.entrada",
  "acesso.saida",
  "encomenda.registrar",
  "encomenda.entregar",
  "visitante.anonimizar",
  "reserva.criar",
  "reserva.cancelar",
  "reserva.aprovar",
  "reserva.recusar",
  "reserva.bloquear",
  "area.criar",
  "area.editar",
  // Comunicados
  "comunicado.criar",
  "comunicado.editar",
  "comunicado.publicar",
  "comunicado.arquivar",
  // Solicitações
  "solicitacao.abrir",
  "solicitacao.comentar",
  "solicitacao.status",
  "solicitacao.cancelar",
  // Documentos (links)
  "documento.criar",
  "documento.editar",
  "documento.desativar",
  // Enquetes
  "enquete.criar",
  "enquete.editar",
  "enquete.publicar",
  "enquete.encerrar",
  "enquete.votar",
  // Votação oficial (o voto é registrado SEM a escolha)
  "eleicao.criar",
  "eleicao.editar",
  "eleicao.publicar",
  "eleicao.rascunho",
  "eleicao.votar",
  "eleicao.bloqueio",
  "eleicao.links",
  "eleicao.contatos",
  "eleicao.foto",
  "eleicao.resultado", // resultado divulgado a todos (apuração automática)
  "eleicao.excluir", // votação de TESTE excluída (scripts/excluir-votacao-teste.ts)
  "eleicao.limpeza", // dados pessoais da votação apagados depois do resultado (LGPD)
  "eleicao.assinatura", // assinatura digital na ata (assinou, removeu, link) — nunca a imagem
  // Classificados
  "classificado.criar",
  "classificado.editar",
  "classificado.aprovar",
  "classificado.rejeitar",
  "classificado.remover",
  "admin.alterar",
] as const;
export type AcaoAuditada = (typeof ACOES_AUDITADAS)[number];

export type RegistroAuditoria = {
  condominioId: string;
  uid: string;
  nome?: string;
  papel?: string;
  acao: AcaoAuditada;
  /** Ex.: "financialEntries/abc123" */
  alvo?: string;
  /** Dados úteis para entender a mudança. NÃO coloque documentos pessoais, senhas ou dados bancários. */
  detalhes?: Record<string, string | number | boolean | null>;
  /**
   * false = não marca o sinal do módulo dentro desta transação: quem chama marca depois,
   * com marcarMudancaDepois (ex.: o voto, para o documento de sinais não ser disputado).
   */
  marcarSinal?: boolean;
};

export function registrarAuditoria(
  db: Firestore,
  escrita: Transaction | WriteBatch,
  registro: RegistroAuditoria,
): void {
  const ref = db
    .collection("condominiums")
    .doc(registro.condominioId)
    .collection("auditLogs")
    .doc();
  escrita.create(ref, {
    condominioId: registro.condominioId,
    uid: registro.uid,
    nome: registro.nome ?? null,
    papel: registro.papel ?? null,
    acao: registro.acao,
    alvo: registro.alvo ?? null,
    detalhes: registro.detalhes ?? {},
    criadoEm: FieldValue.serverTimestamp(),
  });
  // Avisa as telas abertas que este módulo mudou (mesma transação: só vale se a alteração valer).
  const modulo = MODULO_DA_ACAO[registro.acao];
  if (modulo && registro.marcarSinal !== false) marcarMudanca(db, escrita, registro.condominioId, modulo);
}

/** Atalho para ações sem outra gravação junto (ex.: entrar e sair). */
export async function auditarSozinho(db: Firestore, registro: RegistroAuditoria): Promise<void> {
  const lote = db.batch();
  registrarAuditoria(db, lote, registro);
  await lote.commit();
}
