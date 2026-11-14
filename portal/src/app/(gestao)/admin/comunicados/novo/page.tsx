import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { exigirPermissao } from "@/server/contexto";
import { Cartao, TituloPagina } from "@/components/ui/basicos";
import { EditorComunicado } from "@/components/comunicados/editor-comunicado";

export const metadata: Metadata = { title: "Novo comunicado" };

export default async function NovoComunicado() {
  await exigirPermissao("comunicados.publicar");

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <Link href="/admin/comunicados" className="flex min-h-11 w-fit items-center gap-1.5 font-bold text-lake">
        <ArrowLeft aria-hidden className="size-4" /> Comunicados
      </Link>
      <TituloPagina
        sobretitulo="Comunicação"
        titulo="Novo comunicado"
        descricao="Escreva, confira em “Pré-visualizar” e publique. Se preferir, salve como rascunho e publique depois."
      />
      <Cartao>
        <EditorComunicado comunicado={null} />
      </Cartao>
    </div>
  );
}
