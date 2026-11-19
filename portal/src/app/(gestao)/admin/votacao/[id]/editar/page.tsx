import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { exigirPermissao } from "@/server/contexto";
import { obterEleicaoGestao } from "@/server/dados/eleicoes";
import { dateParaDataHoraLocal } from "@/lib/enquetes";
import { idDocumento } from "@/lib/validacao";
import { Cartao, TituloPagina } from "@/components/ui/basicos";
import { FormularioEleicao } from "@/components/eleicoes/formulario-eleicao";

export const metadata: Metadata = { title: "Editar votação" };

/** Só rascunhos podem ser editados. Depois de publicada, a eleição não muda mais. */
export default async function EditarEleicao({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const ctx = await exigirPermissao("eleicoes.gerenciar");
  const { id } = await params;
  if (!idDocumento.safeParse(id).success) notFound();
  const e = await obterEleicaoGestao(ctx, id);
  if (!e) notFound();
  if (e.status !== "rascunho") redirect(`/admin/votacao/${e.id}`);

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <Link
        href={`/admin/votacao/${e.id}`}
        className="flex min-h-11 w-fit items-center gap-1.5 font-bold text-lake"
      >
        <ArrowLeft aria-hidden className="size-4" /> Voltar para a votação
      </Link>
      <TituloPagina
        sobretitulo="Rascunho"
        titulo="Editar votação"
        descricao="Depois de publicar, não dá mais para alterar."
      />
      <Cartao>
        <FormularioEleicao
          valores={{
            id: e.id,
            titulo: e.titulo,
            cargo: e.cargo,
            modo: e.modo,
            vagas: e.vagas,
            escolhasPorCasa: e.escolhasPorCasa,
            permiteBranco: e.permiteBranco,
            regraDesempate: e.regraDesempate,
            abreEm: dateParaDataHoraLocal(e.abreEm, ctx.fuso),
            fechaEm: dateParaDataHoraLocal(e.fechaEm, ctx.fuso),
            candidatos: e.candidatos.map((c) => ({
              nome: c.nome,
              funcao: c.funcao,
              casa: c.casa,
              apresentacao: c.apresentacao,
              nascimento: c.nascimento ?? "",
            })),
          }}
        />
      </Cartao>
    </div>
  );
}
