import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { exigirPermissao } from "@/server/contexto";
import { obterArea } from "@/server/dados/reservas";
import { idDocumento } from "@/lib/validacao";
import { Cartao, TituloPagina } from "@/components/ui/basicos";
import { FormularioArea } from "@/components/reservas/formulario-area";

export const metadata: Metadata = { title: "Editar área ou equipamento" };

export default async function EditarArea({ params }: PageProps<"/admin/reservas/areas/[id]">) {
  const ctx = await exigirPermissao("areas.configurar");
  const { id } = await params;
  if (!idDocumento.safeParse(id).success) notFound();
  const area = await obterArea(ctx, id);
  if (!area) notFound();

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <Link href="/admin/reservas/areas" className="flex min-h-11 w-fit items-center gap-1.5 font-bold text-lake">
        <ArrowLeft aria-hidden className="size-4" /> Áreas e equipamentos
      </Link>
      <TituloPagina sobretitulo="Configurações" titulo={area.nome} descricao="Para tirar a área do ar sem perder o histórico, marque como inativa." />
      <Cartao>
        <FormularioArea area={area} />
      </Cartao>
    </div>
  );
}
