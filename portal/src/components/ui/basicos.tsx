/**
 * Peças visuais básicas: cartão, alerta, etiqueta de status, estado vazio,
 * campo de formulário e título de página.
 */
import type { ComponentProps, ReactNode } from "react";
import { CircleAlert, CircleCheck, Info, TriangleAlert, type LucideIcon } from "lucide-react";
import { cx } from "@/lib/cx";

// ---------- Cartão ----------

export function Cartao({ className, semEspaco = false, ...resto }: ComponentProps<"section"> & { semEspaco?: boolean }) {
  return (
    <section
      className={cx("rounded-[var(--radius-card)] border border-line bg-surface shadow-card", !semEspaco && "p-5", className)}
      {...resto}
    />
  );
}

// ---------- Alerta ----------

type TipoAlerta = "info" | "sucesso" | "aviso" | "erro";

const estiloAlerta: Record<TipoAlerta, { classe: string; icone: LucideIcon; corIcone: string }> = {
  info: { classe: "bg-lake-soft border-lake", icone: Info, corIcone: "text-lake" },
  sucesso: { classe: "bg-ok-soft border-pine", icone: CircleCheck, corIcone: "text-pine" },
  aviso: { classe: "bg-warn-soft border-warn", icone: TriangleAlert, corIcone: "text-warn" },
  erro: { classe: "bg-danger-soft border-danger", icone: CircleAlert, corIcone: "text-danger" },
};

/** Mensagem em destaque. Sempre ícone + texto (nunca só cor). */
export function Alerta({
  tipo = "info",
  titulo,
  children,
  className,
}: {
  tipo?: TipoAlerta;
  titulo: string;
  children?: ReactNode;
  className?: string;
}) {
  const { classe, icone: Icone, corIcone } = estiloAlerta[tipo];
  return (
    <div
      role={tipo === "erro" ? "alert" : "status"}
      className={cx("grid grid-cols-[auto_1fr] items-start gap-x-3 gap-y-0.5 rounded-2xl border-[1.5px] px-4 py-3.5", classe, className)}
    >
      <Icone aria-hidden className={cx("row-span-2 mt-0.5 size-6", corIcone)} />
      <strong className="font-display text-[1.05rem]">{titulo}</strong>
      {children ? <div className="text-ink-2">{children}</div> : null}
    </div>
  );
}

// ---------- Etiqueta de status ----------

type Tom = "ok" | "info" | "aviso" | "erro" | "neutro" | "destaque";

const estiloTom: Record<Tom, string> = {
  ok: "bg-ok-soft text-pine",
  info: "bg-lake-soft text-lake",
  aviso: "bg-warn-soft text-warn",
  erro: "bg-danger-soft text-danger",
  neutro: "bg-surface-2 text-ink-2",
  destaque: "bg-plum-soft text-plum",
};

/** Etiqueta curta de situação (ex.: "Concluída"). O ícone é obrigatório para não depender só da cor. */
export function Etiqueta({ tom = "neutro", icone: Icone, children }: { tom?: Tom; icone: LucideIcon; children: ReactNode }) {
  return (
    <span className={cx("inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1 text-[0.84rem] font-bold", estiloTom[tom])}>
      <Icone aria-hidden className="size-4" />
      {children}
    </span>
  );
}

// ---------- Estado vazio ----------

/** Quando não há nada para mostrar: explica e sugere o próximo passo. */
export function EstadoVazio({
  icone: Icone,
  titulo,
  children,
  acao,
}: {
  icone: LucideIcon;
  titulo: string;
  children?: ReactNode;
  acao?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-line px-5 py-8 text-center">
      <span className="grid size-14 place-items-center rounded-2xl bg-surface-2 text-pine">
        <Icone aria-hidden className="size-7" />
      </span>
      <h3 className="text-lg font-bold">{titulo}</h3>
      {children ? <p className="max-w-sm text-ink-2">{children}</p> : null}
      {acao}
    </div>
  );
}

// ---------- Campo de formulário ----------

export const classeEntrada =
  "w-full min-h-12 rounded-xl border-2 border-line-strong bg-canvas px-4 text-ink placeholder:text-muted " +
  "transition-[border-color,box-shadow] focus:border-pine focus:outline-none focus:shadow-[0_0_0_4px_var(--ok-soft)] " +
  "aria-invalid:border-danger";

/** Rótulo + entrada + dica + erro, já ligados para leitores de tela. */
export function Campo({
  id,
  rotulo,
  dica,
  erro,
  children,
}: {
  id: string;
  rotulo: string;
  dica?: string;
  erro?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="font-bold">
        {rotulo}
      </label>
      {dica ? (
        <p id={`${id}-dica`} className="text-[0.92rem] text-muted">
          {dica}
        </p>
      ) : null}
      {children}
      {erro ? (
        <p id={`${id}-erro`} className="flex items-center gap-1.5 text-[0.92rem] font-bold text-danger">
          <CircleAlert aria-hidden className="size-4" />
          {erro}
        </p>
      ) : null}
    </div>
  );
}

// ---------- Título de página ----------

export function TituloPagina({
  titulo,
  descricao,
  acoes,
  sobretitulo,
}: {
  titulo: string;
  descricao?: ReactNode;
  acoes?: ReactNode;
  sobretitulo?: string;
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div className="flex flex-col gap-1">
        {sobretitulo ? (
          <p className="text-[0.78rem] font-bold uppercase tracking-[0.1em] text-plum">{sobretitulo}</p>
        ) : null}
        <h1 className="text-[1.75rem] font-bold sm:text-[2rem]">{titulo}</h1>
        {descricao ? <p className="max-w-2xl text-ink-2">{descricao}</p> : null}
      </div>
      {acoes ? <div className="flex flex-wrap gap-2">{acoes}</div> : null}
    </header>
  );
}
