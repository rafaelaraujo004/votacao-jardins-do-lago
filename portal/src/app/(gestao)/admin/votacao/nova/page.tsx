import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { exigirPermissao } from "@/server/contexto";
import { dateParaDataHoraLocal } from "@/lib/enquetes";
import { Cartao, TituloPagina } from "@/components/ui/basicos";
import { FormularioEleicao } from "@/components/eleicoes/formulario-eleicao";

export const metadata: Metadata = { title: "Nova votação" };

export default async function NovaEleicao() {
  const ctx = await exigirPermissao("eleicoes.gerenciar");
  // Sugestão do condomínio: daqui a 7 dias, das 7h às 17h.
  const dia = dateParaDataHoraLocal(
    new Date(new Date().getTime() + 7 * 86_400_000),
    ctx.fuso,
  ).slice(0, 10);
  const ano = dia.slice(0, 4);

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <Link
        href="/admin/votacao"
        className="flex min-h-11 w-fit items-center gap-1.5 font-bold text-lake"
      >
        <ArrowLeft aria-hidden className="size-4" /> Votação oficial
      </Link>
      <TituloPagina
        sobretitulo="Comunicação"
        titulo="Nova votação"
        descricao="Fica como rascunho até você publicar. Depois de publicada, regras e candidatos não mudam."
      />
      <Cartao>
        <FormularioEleicao
          valores={{
            id: null,
            // Mandato de dois anos: "2026/2027".
            titulo: `Eleição do síndico e conselho ${ano}/${Number(ano) + 1}`,
            cargo: "Chapa única",
            modo: "chapa",
            vagas: 3,
            escolhasPorCasa: 1,
            permiteBranco: true,
            regraDesempate: "idade",
            abreEm: `${dia}T07:00`,
            fechaEm: `${dia}T17:00`,
            candidatos: [],
          }}
        />
      </Cartao>
    </div>
  );
}
