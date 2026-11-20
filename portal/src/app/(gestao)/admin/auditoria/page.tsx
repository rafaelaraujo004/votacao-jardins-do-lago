import type { Metadata } from "next";
import {
  Archive,
  Ban,
  CalendarCheck,
  CircleCheck,
  CircleX,
  ClipboardList,
  FilePlus2,
  FileX2,
  FolderOpen,
  Megaphone,
  MessageSquare,
  RefreshCw,
  Send,
  Store,
  Vote,
  CalendarPlus,
  CalendarX2,
  DoorClosed,
  DoorOpen,
  Eraser,
  KeyRound,
  LogIn,
  LogOut,
  Package,
  PackageCheck,
  Pencil,
  ScrollText,
  Settings,
  TreePalm,
  UserCheck,
  UserX,
  type LucideIcon,
} from "lucide-react";
import { exigirPermissao } from "@/server/contexto";
import { ultimosRegistrosDeAuditoria } from "@/server/dados/gestao";
import { formatarDataHora } from "@/lib/formato";
import { ehPapel, NOME_DO_PAPEL } from "@/lib/permissoes";
import { Cartao, EstadoVazio, TituloPagina } from "@/components/ui/basicos";

export const metadata: Metadata = { title: "Auditoria" };

/** Ações em linguagem simples. As que não estão aqui aparecem com o código técnico. */
const DESCRICAO: Record<string, { texto: string; icone: LucideIcon }> = {
  "sessao.entrar": { texto: "Entrou no portal", icone: LogIn },
  "sessao.sair": { texto: "Saiu do portal", icone: LogOut },
  "condominio.criar": { texto: "Criou o condomínio no sistema", icone: Settings },
  "membro.criar": { texto: "Cadastrou uma pessoa", icone: Settings },
  "membro.alterar": { texto: "Alterou o cadastro de uma pessoa", icone: Pencil },
  "membro.permissoes": { texto: "Alterou as permissões de uma pessoa", icone: Settings },
  "membro.suspender": { texto: "Suspendeu o acesso de uma pessoa", icone: UserX },
  "membro.reativar": { texto: "Reativou o acesso de uma pessoa", icone: UserCheck },
  "membro.excluir": { texto: "Excluiu o cadastro de uma pessoa", icone: UserX },
  "membro.importar": { texto: "Trouxe pessoas da lista de contatos (um lote)", icone: Settings },
  // Acesso com senha (equipe)
  "acesso.criar_senha": { texto: "Criou o acesso com senha de alguém da equipe", icone: KeyRound },
  "acesso.criar_morador": { texto: "Criou o usuário e a senha de um morador", icone: KeyRound },
  "acesso.redefinir_senha": { texto: "Gerou nova senha provisória", icone: KeyRound },
  "acesso.trocar_senha": { texto: "Trocou a própria senha", icone: KeyRound },
  // Portaria
  "visitante.autorizar": { texto: "Autorizou uma visita", icone: UserCheck },
  "visitante.cancelar": { texto: "Cancelou uma autorização de visita", icone: UserX },
  "visitante.anonimizar": { texto: "Removeu nomes antigos de visitantes (LGPD)", icone: Eraser },
  "acesso.entrada": { texto: "Registrou entrada na portaria", icone: DoorOpen },
  "acesso.saida": { texto: "Registrou saída na portaria", icone: DoorClosed },
  "encomenda.registrar": { texto: "Registrou encomenda", icone: Package },
  "encomenda.entregar": { texto: "Entregou encomenda", icone: PackageCheck },
  // Reservas
  "reserva.criar": { texto: "Criou reserva", icone: CalendarPlus },
  "reserva.aprovar": { texto: "Aprovou reserva", icone: CalendarCheck },
  "reserva.recusar": { texto: "Recusou pedido de reserva", icone: CalendarX2 },
  "reserva.cancelar": { texto: "Cancelou reserva", icone: CalendarX2 },
  "reserva.bloquear": { texto: "Bloqueou horário de área", icone: Ban },
  "area.criar": { texto: "Cadastrou área de lazer", icone: TreePalm },
  "area.editar": { texto: "Alterou área de lazer", icone: Pencil },
  // Configurações
  "informacoes.alterar": { texto: "Alterou as informações do condomínio", icone: Settings },
  // Comunicados
  "comunicado.criar": { texto: "Criou comunicado", icone: Megaphone },
  "comunicado.editar": { texto: "Alterou comunicado", icone: Pencil },
  "comunicado.publicar": { texto: "Publicou comunicado", icone: Send },
  "comunicado.arquivar": { texto: "Arquivou comunicado", icone: Archive },
  // Solicitações
  "solicitacao.abrir": { texto: "Abriu solicitação", icone: ClipboardList },
  "solicitacao.comentar": { texto: "Comentou em solicitação", icone: MessageSquare },
  "solicitacao.status": { texto: "Mudou a situação de solicitação", icone: RefreshCw },
  "solicitacao.cancelar": { texto: "Cancelou solicitação", icone: CircleX },
  // Documentos
  "documento.criar": { texto: "Cadastrou documento", icone: FilePlus2 },
  "documento.editar": { texto: "Alterou documento", icone: FolderOpen },
  "documento.desativar": { texto: "Desativou documento", icone: FileX2 },
  // Enquetes
  "enquete.criar": { texto: "Criou enquete (rascunho)", icone: Vote },
  "enquete.editar": { texto: "Editou rascunho de enquete", icone: Pencil },
  "enquete.publicar": { texto: "Publicou enquete", icone: Send },
  "enquete.encerrar": { texto: "Encerrou enquete antes do prazo", icone: Archive },
  "enquete.votar": { texto: "Casa votou em enquete (opção não registrada)", icone: Vote },
  // Classificados
  "classificado.criar": { texto: "Enviou anúncio para aprovação", icone: Store },
  "classificado.aprovar": { texto: "Aprovou anúncio", icone: CircleCheck },
  "classificado.rejeitar": { texto: "Não aprovou anúncio", icone: CircleX },
  "classificado.remover": { texto: "Removeu anúncio", icone: Archive },
};

export default async function PaginaAuditoria() {
  const ctx = await exigirPermissao("auditoria.ver");
  const registros = await ultimosRegistrosDeAuditoria(ctx, 50);

  return (
    <div className="flex flex-col gap-6">
      <TituloPagina
        sobretitulo="Controle"
        titulo="Auditoria"
        descricao="Registro de tudo o que é importante: quem fez, o quê e quando. Ninguém pode alterar ou apagar estes registros."
      />

      {registros.length === 0 ? (
        <EstadoVazio icone={ScrollText} titulo="Nenhum registro ainda">
          As ações importantes aparecerão aqui assim que acontecerem.
        </EstadoVazio>
      ) : (
        <Cartao semEspaco>
          <h2 className="sr-only">Últimos {registros.length} registros</h2>
          <ol className="divide-y divide-line">
            {registros.map((r) => {
              const d = DESCRICAO[r.acao] ?? { texto: r.acao, icone: ScrollText };
              const Icone = d.icone;
              return (
                <li key={r.id} className="flex items-start gap-3 px-4 py-3.5 sm:items-center">
                  <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-lake-soft text-lake">
                    <Icone aria-hidden className="size-5" />
                  </span>
                  <div className="flex min-w-0 flex-1 flex-col sm:flex-row sm:items-center sm:gap-4">
                    <div className="min-w-0 flex-1">
                      <p className="font-bold">{d.texto}</p>
                      <p className="text-[0.92rem] text-muted">
                        {r.nome ?? "Sistema"}
                        {r.papel && ehPapel(r.papel) ? ` · ${NOME_DO_PAPEL[r.papel]}` : ""}
                        {r.alvo ? ` · ${r.alvo}` : ""}
                      </p>
                    </div>
                    <time
                      className="text-[0.92rem] tabular-nums text-ink-2"
                      dateTime={r.quando?.toISOString()}
                    >
                      {r.quando ? formatarDataHora(r.quando, ctx.fuso) : "—"}
                    </time>
                  </div>
                </li>
              );
            })}
          </ol>
        </Cartao>
      )}
    </div>
  );
}
