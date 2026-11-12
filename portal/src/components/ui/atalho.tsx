/**
 * Atalho grande da tela inicial.
 * - Com `href`: é um link de verdade.
 * - Com `emBreve`: aparece, mas NÃO é clicável, e diz claramente quando chega.
 *   (Regra do projeto: nada de botão decorativo que não faz nada.)
 */
import Link from "next/link";
import { ChevronRight, Clock, type LucideIcon } from "lucide-react";
import { cx } from "@/lib/cx";

type Props = {
  icone: LucideIcon;
  titulo: string;
  descricao: string;
  href?: string;
  emBreve?: string;
  tom?: "pine" | "lake" | "plum";
};

const tons = {
  pine: "bg-ok-soft text-pine",
  lake: "bg-lake-soft text-lake",
  plum: "bg-plum-soft text-plum",
};

export function Atalho({ icone: Icone, titulo, descricao, href, emBreve, tom = "pine" }: Props) {
  const conteudo = (
    <>
      <span className={cx("grid size-12 shrink-0 place-items-center rounded-2xl", tons[tom])}>
        <Icone aria-hidden className="size-6" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="font-display text-[1.08rem] font-bold leading-tight">{titulo}</span>
        <span className="text-[0.92rem] leading-snug text-muted">{descricao}</span>
        {emBreve ? (
          <span className="mt-1.5 inline-flex items-center gap-1 self-start rounded-full bg-sand px-2.5 py-0.5 text-[0.78rem] font-bold text-ink">
            <Clock aria-hidden className="size-3.5" />
            Em breve · {emBreve}
          </span>
        ) : null}
      </span>
    </>
  );

  const classes =
    "flex min-h-24 items-center gap-3.5 rounded-[var(--radius-card)] border border-line bg-surface p-4 shadow-card";

  if (href && !emBreve) {
    return (
      <Link href={href} className={cx(classes, "transition-[border-color,transform] hover:border-pine active:translate-y-px")}>
        {conteudo}
        <ChevronRight aria-hidden className="size-5 text-muted" />
      </Link>
    );
  }

  return (
    <div className={cx(classes, "opacity-80")} aria-disabled="true">
      {conteudo}
    </div>
  );
}
