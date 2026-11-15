import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { exigirPermissao } from "@/server/contexto";
import { obterEnqueteGestao } from "@/server/dados/enquetes";
import { dateParaDataHoraLocal } from "@/lib/enquetes";
import { idDocumento } from "@/lib/validacao";
import { Cartao, TituloPagina } from "@/components/ui/basicos";
import { FormularioEnquete } from "@/components/enquetes/formulario-enquete";

export const metadata: Metadata = { title: "Editar enquete" };

/** Só rascunhos podem ser editados. Depois de publicada, a enquete não muda mais. */
export default async function EditarEnquete({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await exigirPermissao("enquetes.gerenciar");
  const { id } = await params;
  if (!idDocumento.safeParse(id).success) notFound();
  const e = await obterEnqueteGestao(ctx, id);
  if (!e) notFound();
  if (e.status !== "rascunho") redirect(`/admin/enquetes/${e.id}`);

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <Link href={`/admin/enquetes/${e.id}`} className="flex min-h-11 w-fit items-center gap-1.5 font-bold text-lake">
        <ArrowLeft aria-hidden className="size-4" /> Voltar para a enquete
      </Link>
      <TituloPagina sobretitulo="Rascunho" titulo="Editar enquete" descricao="Depois de publicar, não dá mais para alterar." />
      <Cartao>
        <FormularioEnquete
          valores={{
            id: e.id,
            pergunta: e.pergunta,
            descricao: e.descricao,
            opcoes: e.opcoes.map((o) => o.texto),
            abreEm: dateParaDataHoraLocal(e.abreEm, ctx.fuso),
            fechaEm: dateParaDataHoraLocal(e.fechaEm, ctx.fuso),
            resultado: e.resultado,
          }}
        />
      </Cartao>
    </div>
  );
}
