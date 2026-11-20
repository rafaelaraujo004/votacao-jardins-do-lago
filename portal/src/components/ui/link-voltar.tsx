/**
 * Link "← Voltar" do topo das telas do MORADOR. Nessas telas o conteúdo sobe por cima
 * da faixa verde (layout com -mt-12) e, no celular, o link fica metade sobre o verde
 * escuro e metade sobre o fundo claro. Por isso é uma "pílula" com fundo próprio
 * (cor de cartão + borda + sombra): fica legível em qualquer posição e nos dois temas.
 */
import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export function LinkVoltarFaixa({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      className="flex min-h-11 w-fit items-center gap-1.5 rounded-full border border-borda-luz bg-surface px-3.5 font-bold text-destaque shadow-relevo transition-shadow active:shadow-afundado focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-lake"
    >
      <ArrowLeft aria-hidden className="size-4" /> {children}
    </Link>
  );
}
