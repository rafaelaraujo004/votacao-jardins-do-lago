import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { exigirPermissao } from "@/server/contexto";
import { Cartao, TituloPagina } from "@/components/ui/basicos";
import { AvisoComoCompartilhar } from "@/components/documentos/pecas";
import { FormularioDocumento } from "@/components/documentos/formulario-documento";

export const metadata: Metadata = { title: "Novo documento" };

export default async function NovoDocumento() {
  await exigirPermissao("documentos.gerenciar", "/admin/documentos/novo");

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <Link href="/admin/documentos" className="flex min-h-11 w-fit items-center gap-1.5 font-bold text-lake">
        <ArrowLeft aria-hidden className="size-4" /> Documentos
      </Link>
      <TituloPagina sobretitulo="Comunicação" titulo="Novo documento" descricao="O documento fica guardado no Google Drive (ou outro serviço); aqui você cadastra o link." />
      <AvisoComoCompartilhar />
      <Cartao>
        <FormularioDocumento documento={null} />
      </Cartao>
    </div>
  );
}
