import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { exigirPermissao } from "@/server/contexto";
import { dateParaDataHoraLocal } from "@/lib/enquetes";
import { Cartao, TituloPagina } from "@/components/ui/basicos";
import { FormularioEnquete } from "@/components/enquetes/formulario-enquete";

export const metadata: Metadata = { title: "Nova enquete" };

export default async function NovaEnquete() {
  const ctx = await exigirPermissao("enquetes.gerenciar");
  // Sugestão: abre na próxima hora cheia e fecha 7 dias depois, às 20h.
  const agora = new Date();
  const proximaHora = new Date(Math.ceil((agora.getTime() + 60_000) / 3_600_000) * 3_600_000);
  const abre = dateParaDataHoraLocal(proximaHora, ctx.fuso);
  const daquiUmaSemana = dateParaDataHoraLocal(new Date(proximaHora.getTime() + 7 * 86_400_000), ctx.fuso);
  const fecha = `${daquiUmaSemana.slice(0, 10)}T20:00`;

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <Link href="/admin/enquetes" className="flex min-h-11 w-fit items-center gap-1.5 font-bold text-lake">
        <ArrowLeft aria-hidden className="size-4" /> Enquetes
      </Link>
      <TituloPagina
        sobretitulo="Comunicação"
        titulo="Nova enquete"
        descricao="A enquete fica como rascunho até você publicar. Cada casa vota uma vez."
      />
      <Cartao>
        <FormularioEnquete
          valores={{ id: null, pergunta: "", descricao: "", opcoes: [], abreEm: abre, fechaEm: fecha, resultado: "apos_encerrar" }}
        />
      </Cartao>
    </div>
  );
}
