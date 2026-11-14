/**
 * Peças do painel no estilo "Jardim macio":
 * blocos de número, atalhos de módulo, seletor em pílula e a faixa de pétalas.
 */
import Link from "next/link";
import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cx } from "@/lib/cx";

// ---------- Faixa nas cores das pétalas da logo ----------

const PETALAS = ["bg-petala-laranja", "bg-petala-amarelo", "bg-petala-rosa", "bg-petala-verde", "bg-petala-azul", "bg-petala-roxo"];

export function FaixaPetalas({ className }: { className?: string }) {
  return (
    <div aria-hidden className={cx("flex h-[5px]", className)}>
      {PETALAS.map((c) => (
        <i key={c} className={cx("flex-1", c)} />
      ))}
    </div>
  );
}

// ---------- Bloco de número (rótulo em caixa alta + número grande) ----------

export type CorNumero = "pine" | "plum" | "lake" | "ink" | "laranja";
const coresNumero: Record<CorNumero, string> = {
  pine: "text-destaque",
  plum: "text-plum",
  lake: "text-lake",
  ink: "text-ink",
  laranja: "text-texto-laranja",
};

export function BlocoNumero({
  rotulo,
  valor,
  detalhe,
  cor = "ink",
  className,
}: {
  rotulo: string;
  valor: ReactNode;
  detalhe?: ReactNode;
  cor?: CorNumero;
  className?: string;
}) {
  return (
    <div className={cx("saltado min-w-0 rounded-[18px] px-3 py-3", className)}>
      <span className="rotulo-caixa block truncate">{rotulo}</span>
      <span
        className={cx(
          "mt-1.5 block font-display text-[clamp(1rem,4.2vw,1.3rem)] font-extrabold leading-tight tracking-tight tabular-nums",
          coresNumero[cor],
        )}
      >
        {valor}
      </span>
      {detalhe ? <span className="mt-0.5 block truncate text-[0.74rem] text-muted">{detalhe}</span> : null}
    </div>
  );
}

// ---------- Atalho de módulo (quadradinho com ícone colorido) ----------

export type TomModulo = "verde" | "lago" | "vinho" | "areia";
const tonsModulo: Record<TomModulo, string> = {
  verde: "bg-ok-soft text-pine",
  lago: "bg-lake-soft text-lake",
  vinho: "bg-plum-soft text-plum",
  areia: "bg-sand text-texto-areia",
};

/**
 * Com `href`: link de verdade. Sem `href`: aparece com a etiqueta "Em breve"
 * e não é clicável (regra do projeto: nada de botão que não faz nada).
 */
export function AtalhoModulo({
  icone: Icone,
  titulo,
  href,
  tom = "verde",
}: {
  icone: LucideIcon;
  titulo: string;
  href?: string;
  tom?: TomModulo;
}) {
  const conteudo = (
    <>
      <span className={cx("grid size-[46px] place-items-center rounded-[14px]", tonsModulo[tom])}>
        <Icone aria-hidden className="size-6" />
      </span>
      {/* Palavra longa (ex.: "Classificados") quebra com hífen em vez de vazar do quadradinho no celular. */}
      <span className="max-w-full break-words text-[0.82rem] font-bold leading-tight text-ink hyphens-auto">{titulo}</span>
      {!href ? (
        <span className="rounded-full bg-sand px-2 py-px text-[0.66rem] font-bold uppercase tracking-wide text-ink-2">
          Em breve
        </span>
      ) : null}
    </>
  );
  const classes =
    "saltado flex h-full min-h-24 flex-col items-center justify-start gap-1.5 rounded-2xl px-1 pb-2.5 pt-3 text-center";
  if (href) {
    return (
      <Link href={href} className={cx(classes, "transition-shadow active:shadow-afundado")}>
        {conteudo}
      </Link>
    );
  }
  return (
    <div className={cx(classes, "opacity-75")} aria-disabled="true">
      {conteudo}
    </div>
  );
}

// ---------- Seletor em pílula (links: funciona sem JavaScript) ----------

export function SegmentoLinks({
  opcoes,
  rotulo,
  rolavel = false,
  ariaCurrent = "true",
}: {
  opcoes: { rotulo: string; href: string; ativo: boolean }[];
  rotulo: string;
  /** true: se faltar espaço, só o seletor rola de lado (a página não). */
  rolavel?: boolean;
  /** "page" quando cada opção leva a uma "página" diferente (ex.: filtro de lista). */
  ariaCurrent?: "true" | "page";
}) {
  const seletor = (
    <nav aria-label={rotulo} className="afundado inline-flex gap-1 rounded-full p-[5px]">
      {opcoes.map((o) => (
        <Link
          key={o.href}
          href={o.href}
          scroll={false}
          aria-current={o.ativo ? ariaCurrent : undefined}
          className={cx(
            "inline-flex min-h-10 min-w-[76px] shrink-0 items-center justify-center whitespace-nowrap rounded-full px-4 text-[0.92rem] font-bold",
            o.ativo ? "saltado text-destaque" : "text-muted hover:text-ink",
          )}
        >
          {o.rotulo}
        </Link>
      ))}
    </nav>
  );
  if (!rolavel) return seletor;
  return <div className="-mx-1 max-w-full overflow-x-auto px-1 py-1">{seletor}</div>;
}

// ---------- Título de seção ----------

export function TituloSecao({ children, extra, id }: { children: ReactNode; extra?: ReactNode; id?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <h2 id={id} className="text-[1.2rem] font-bold text-destaque">
        {children}
      </h2>
      {extra ? <span className="text-[0.88rem] text-muted">{extra}</span> : null}
    </div>
  );
}

// ---------- Cabeçalho de página (cartão com sobretítulo, título e subtítulo) ----------

export function CabecalhoPagina({
  sobretitulo,
  titulo,
  subtitulo,
  children,
}: {
  sobretitulo?: string;
  titulo: string;
  subtitulo?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <header className="surgir rounded-[var(--radius-card)] border border-borda-luz bg-surface p-5 shadow-card">
      {sobretitulo ? <p className="rotulo-caixa text-plum">{sobretitulo}</p> : null}
      <h1 className={cx("text-[1.7rem] font-bold text-destaque", sobretitulo && "mt-1")}>{titulo}</h1>
      {subtitulo ? <p className="mt-1 text-ink-2">{subtitulo}</p> : null}
      {children}
    </header>
  );
}
