import type { Metadata } from "next";
import { exigirAreaDoMorador } from "@/server/contexto";
import { lerVistasEm, notificacoesDaPessoa } from "@/server/dados/notificacoes";
import { CabecalhoPagina } from "@/components/ui/painel";
import { Cartao } from "@/components/ui/basicos";
import { ListaNotificacoes } from "@/components/notificacoes/lista";
import { MarcarComoVistas } from "@/components/notificacoes/marcar-vistas";

export const metadata: Metadata = { title: "Notificações" };

/**
 * Notificações do morador (a lista completa do sino): votação oficial, enquetes,
 * comunicados, documentos e as respostas aos pedidos da casa.
 */
export default async function NotificacoesMorador() {
  const ctx = await exigirAreaDoMorador();
  const agora = new Date();
  const [itens, vistasEm] = await Promise.all([notificacoesDaPessoa(ctx, agora), lerVistasEm(ctx)]);

  return (
    <div className="flex flex-col gap-5">
      <CabecalhoPagina
        sobretitulo="Avisos"
        titulo="Notificações"
        subtitulo="Votações, enquetes, comunicados da administração e as respostas aos pedidos da sua casa (últimos 30 dias)."
      />
      <Cartao className="p-3 sm:p-4">
        <ListaNotificacoes itens={itens} vistasEm={vistasEm} agora={agora.getTime()} fuso={ctx.fuso} />
      </Cartao>
      <MarcarComoVistas />
    </div>
  );
}
