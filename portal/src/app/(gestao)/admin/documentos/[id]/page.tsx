import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { exigirPermissao } from "@/server/contexto";
import { obterDocumento } from "@/server/dados/documentos";
import { idDocumento } from "@/lib/validacao";
import { Cartao, TituloPagina } from "@/components/ui/basicos";
import { AvisoComoCompartilhar } from "@/components/documentos/pecas";
import { FormularioDocumento } from "@/components/documentos/formulario-documento";

export const metadata: Metadata = { title: "Editar documento" };

export default async function EditarDocumento({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await exigirPermissao("documentos.gerenciar", "/admin/documentos");
  const { id } = await params;
  if (!idDocumento.safeParse(id).success) notFound();
  const doc = await obterDocumento(ctx, id);
  if (!doc) notFound();

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <Link href="/admin/documentos" className="flex min-h-11 w-fit items-center gap-1.5 font-bold text-lake">
        <ArrowLeft aria-hidden className="size-4" /> Documentos
      </Link>
      <TituloPagina
        sobretitulo="Comunicação"
        titulo={doc.titulo}
        descricao="Para tirar o documento da lista sem perder o histórico, escolha “Desativado”."
      />
      <Cartao>
        {/* Lista fechada: só os campos que o formulário usa. */}
        <FormularioDocumento
          documento={{
            id: doc.id,
            titulo: doc.titulo,
            descricao: doc.descricao,
            categoria: doc.categoria,
            url: doc.url,
            visivelPara: doc.visivelPara,
            ativo: doc.ativo,
          }}
        />
      </Cartao>
      <AvisoComoCompartilhar />
    </div>
  );
}
