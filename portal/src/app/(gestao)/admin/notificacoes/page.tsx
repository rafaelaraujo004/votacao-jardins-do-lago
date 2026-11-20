import type { Metadata } from "next";
import { exigirPermissao } from "@/server/contexto";
import { lerVistasEm, notificacoesDaPessoa } from "@/server/dados/notificacoes";
import { Cartao, TituloPagina } from "@/components/ui/basicos";
import { ListaNotificacoes } from "@/components/notificacoes/lista";
import { MarcarComoVistas } from "@/components/notificacoes/marcar-vistas";

export const metadata: Metadata = { title: "Notificações" };

/**
 * Notificações da administração (a lista completa do sino): tudo que espera uma
 * decisão — anúncios para aprovar, reservas pendentes e solicitações abertas —,
 * conforme as permissões do perfil.
 */
export default async function NotificacoesGestao() {
  const ctx = await exigirPermissao("area.gestao");
  const agora = new Date();
  const [itens, vistasEm] = await Promise.all([notificacoesDaPessoa(ctx, agora), lerVistasEm(ctx)]);

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <TituloPagina
        sobretitulo="Visão geral"
        titulo="Notificações"
        descricao="O que está esperando a administração: anúncios para aprovar, reservas pendentes e solicitações abertas. Cada item leva à tela onde se resolve."
      />
      <Cartao className="p-3 sm:p-4">
        <ListaNotificacoes
          itens={itens}
          vistasEm={vistasEm}
          agora={agora.getTime()}
          fuso={ctx.fuso}
          vazio="Nada esperando a administração agora."
        />
      </Cartao>
      <MarcarComoVistas />
    </div>
  );
}
