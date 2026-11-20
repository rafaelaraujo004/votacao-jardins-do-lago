import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { exigirPermissao } from "@/server/contexto";
import { responsaveisPossiveis } from "@/server/dados/reservas";
import { Cartao, TituloPagina } from "@/components/ui/basicos";
import { FormularioArea } from "@/components/reservas/formulario-area";

export const metadata: Metadata = { title: "Nova área ou equipamento" };

export default async function NovaArea() {
  const ctx = await exigirPermissao("areas.configurar");
  const responsaveis = await responsaveisPossiveis(ctx);
  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <Link href="/admin/reservas/areas" className="flex min-h-11 w-fit items-center gap-1.5 font-bold text-lake">
        <ArrowLeft aria-hidden className="size-4" /> Áreas e equipamentos
      </Link>
      <TituloPagina sobretitulo="Configurações" titulo="Nova área ou equipamento" descricao="Defina as regras, os limites e os horários que podem ser reservados." />
      <Cartao>
        <FormularioArea area={null} responsaveis={responsaveis} />
      </Cartao>
    </div>
  );
}
