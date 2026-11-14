import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { exigirPermissao } from "@/server/contexto";
import { Cartao, TituloPagina } from "@/components/ui/basicos";
import { FormularioArea } from "@/components/reservas/formulario-area";

export const metadata: Metadata = { title: "Nova área de lazer" };

export default async function NovaArea() {
  await exigirPermissao("areas.configurar");
  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <Link href="/admin/reservas/areas" className="flex min-h-11 w-fit items-center gap-1.5 font-bold text-lake">
        <ArrowLeft aria-hidden className="size-4" /> Áreas de lazer
      </Link>
      <TituloPagina sobretitulo="Configurações" titulo="Nova área de lazer" descricao="Defina as regras e os horários que podem ser reservados." />
      <Cartao>
        <FormularioArea area={null} />
      </Cartao>
    </div>
  );
}
