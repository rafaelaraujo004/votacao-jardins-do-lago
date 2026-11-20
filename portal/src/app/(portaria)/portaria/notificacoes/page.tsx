import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { exigirPermissao } from "@/server/contexto";
import { lerVistasEm, notificacoesDaPessoa } from "@/server/dados/notificacoes";
import { Cartao, TituloPagina } from "@/components/ui/basicos";
import { ListaNotificacoes } from "@/components/notificacoes/lista";
import { MarcarComoVistas } from "@/components/notificacoes/marcar-vistas";

export const metadata: Metadata = { title: "Notificações" };

/** Notificações da portaria (a lista completa do sino): visitas autorizadas pelos moradores e comunicados. */
export default async function NotificacoesPortaria() {
  const ctx = await exigirPermissao("area.portaria", "/portaria/notificacoes");
  const agora = new Date();
  const [itens, vistasEm] = await Promise.all([notificacoesDaPessoa(ctx, agora), lerVistasEm(ctx)]);

  return (
    <div className="flex max-w-3xl flex-col gap-5">
      <Cartao className="flex flex-col gap-4">
        <Link href="/portaria" className="flex min-h-11 w-fit items-center gap-1.5 font-bold text-lake">
          <ArrowLeft aria-hidden className="size-4" /> Voltar à portaria
        </Link>
        <TituloPagina
          sobretitulo="Avisos"
          titulo="Notificações"
          descricao="Visitas autorizadas pelos moradores (que ainda valem) e comunicados da administração."
        />
      </Cartao>
      <Cartao className="p-3 sm:p-4">
        <ListaNotificacoes itens={itens} vistasEm={vistasEm} agora={agora.getTime()} fuso={ctx.fuso} vazio="Nenhuma visita autorizada nem comunicado novo." />
      </Cartao>
      <MarcarComoVistas />
    </div>
  );
}
