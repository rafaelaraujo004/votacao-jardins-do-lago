import Link from "next/link";
import { LoaderCircle } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { cx } from "@/lib/cx";

type Variante = "primario" | "secundario" | "perigo" | "discreto";
type Tamanho = "normal" | "grande" | "pequeno";

const base =
  "inline-flex items-center justify-center gap-2 rounded-xl border-2 font-bold leading-tight text-center " +
  "transition-[background-color,border-color,transform] duration-150 active:translate-y-px " +
  "disabled:cursor-not-allowed disabled:opacity-50 aria-disabled:cursor-not-allowed aria-disabled:opacity-50";

const variantes: Record<Variante, string> = {
  primario: "border-transparent bg-pine text-on-pine shadow-[0_6px_16px_-8px_var(--pine)] hover:bg-pine-strong",
  secundario: "border-line-strong bg-surface text-ink hover:border-ink-2",
  perigo: "border-transparent bg-danger text-on-danger hover:opacity-90",
  discreto: "border-transparent bg-transparent text-ink-2 hover:bg-surface-2",
};

const tamanhos: Record<Tamanho, string> = {
  pequeno: "min-h-10 px-3 text-[0.9rem] rounded-[10px]",
  normal: "min-h-12 px-5",
  grande: "min-h-16 px-6 text-[1.15rem] rounded-2xl",
};

export function classesDoBotao(variante: Variante = "primario", tamanho: Tamanho = "normal", largo = false) {
  return cx(base, variantes[variante], tamanhos[tamanho], largo && "w-full");
}

type PropsBotao = ComponentProps<"button"> & {
  variante?: Variante;
  tamanho?: Tamanho;
  largo?: boolean;
  carregando?: boolean;
  icone?: ReactNode;
};

/** Botão padrão. Com `carregando`, mostra um indicador e fica desativado. */
export function Botao({
  variante,
  tamanho,
  largo,
  carregando = false,
  icone,
  className,
  children,
  disabled,
  type = "button",
  ...resto
}: PropsBotao) {
  return (
    <button
      type={type}
      className={cx(classesDoBotao(variante, tamanho, largo), className)}
      disabled={disabled || carregando}
      aria-busy={carregando || undefined}
      {...resto}
    >
      {carregando ? <LoaderCircle aria-hidden className="size-5 animate-spin" /> : icone}
      {children}
    </button>
  );
}

type PropsBotaoLink = ComponentProps<typeof Link> & {
  variante?: Variante;
  tamanho?: Tamanho;
  largo?: boolean;
  icone?: ReactNode;
};

/** Link com cara de botão (para navegar). */
export function BotaoLink({ variante, tamanho, largo, icone, className, children, ...resto }: PropsBotaoLink) {
  return (
    <Link className={cx(classesDoBotao(variante, tamanho, largo), className)} {...resto}>
      {icone}
      {children}
    </Link>
  );
}
