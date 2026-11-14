/**
 * Peças dos comunicados: etiquetas (ícone + texto, nunca só cor), o texto
 * em parágrafos e o cartão da lista. Servem tanto para a tela do morador
 * quanto para a pré-visualização do síndico.
 *
 * Segurança: o texto é mostrado como TEXTO (o React escapa tudo). Nunca use
 * dangerouslySetInnerHTML aqui.
 */
import Link from "next/link";
import type { ReactNode } from "react";
import { Archive, ChevronRight, FilePen, Megaphone, Pin, Sparkles, TriangleAlert, CircleCheck } from "lucide-react";
import { Etiqueta } from "@/components/ui/basicos";
import { cx } from "@/lib/cx";
import { ROTULO_STATUS_COMUNICADO, paragrafos, resumir, type Prioridade, type StatusComunicado } from "@/lib/comunicados";

export function EtiquetaUrgente() {
  return (
    <Etiqueta tom="erro" icone={TriangleAlert}>
      Urgente
    </Etiqueta>
  );
}

export function EtiquetaFixado() {
  return (
    <Etiqueta tom="info" icone={Pin}>
      Fixado
    </Etiqueta>
  );
}

export function EtiquetaNovo() {
  return (
    <Etiqueta tom="destaque" icone={Sparkles}>
      Novo
    </Etiqueta>
  );
}

const ESTILO_STATUS = {
  rascunho: { tom: "aviso", icone: FilePen },
  publicado: { tom: "ok", icone: CircleCheck },
  arquivado: { tom: "neutro", icone: Archive },
} as const;

export function EtiquetaStatusComunicado({ status }: { status: StatusComunicado }) {
  const { tom, icone } = ESTILO_STATUS[status];
  return (
    <Etiqueta tom={tom} icone={icone}>
      {ROTULO_STATUS_COMUNICADO[status]}
    </Etiqueta>
  );
}

/** Linha de etiquetas (urgente, fixado, novo). Não mostra nada se não houver nenhuma. */
export function EtiquetasComunicado({
  prioridade,
  fixado,
  novo,
}: {
  prioridade: Prioridade;
  fixado: boolean;
  novo: boolean;
}) {
  if (prioridade !== "urgente" && !fixado && !novo) return null;
  return (
    <span className="flex flex-wrap gap-1.5">
      {prioridade === "urgente" ? <EtiquetaUrgente /> : null}
      {fixado ? <EtiquetaFixado /> : null}
      {novo ? <EtiquetaNovo /> : null}
    </span>
  );
}

/** Texto do comunicado: parágrafos separados por linha em branco; quebras simples são mantidas. */
export function TextoComunicado({ texto, className }: { texto: string; className?: string }) {
  const partes = paragrafos(texto);
  if (!partes.length) return <p className="text-muted">Sem texto.</p>;
  return (
    <div className={cx("flex flex-col gap-3 text-[1.02rem] leading-relaxed text-ink", className)}>
      {partes.map((p, i) => (
        <p key={i} className="whitespace-pre-line break-words">
          {p}
        </p>
      ))}
    </div>
  );
}

/** Cartão da lista (morador e gestão). O urgente ganha borda e fundo de alerta. */
export function CartaoComunicado({
  href,
  titulo,
  texto,
  prioridade,
  fixado,
  novo,
  data,
  extra,
}: {
  href: string;
  titulo: string;
  texto: string;
  prioridade: Prioridade;
  fixado: boolean;
  novo: boolean;
  /** Ex.: "Publicado em 12/11/2026". */
  data?: string;
  /** Etiqueta extra (ex.: situação, na gestão). */
  extra?: ReactNode;
}) {
  const urgente = prioridade === "urgente";
  return (
    <Link
      href={href}
      className={cx(
        "flex items-start gap-3 rounded-[var(--radius-card)] border p-4 shadow-card transition-shadow active:shadow-afundado",
        urgente ? "border-danger bg-danger-soft" : "border-borda-luz bg-surface",
      )}
    >
      <span
        className={cx(
          "grid size-11 shrink-0 place-items-center rounded-[14px]",
          urgente ? "bg-surface text-danger" : "bg-sand text-texto-areia",
        )}
      >
        {urgente ? <TriangleAlert aria-hidden className="size-6" /> : <Megaphone aria-hidden className="size-6" />}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-1.5">
        {extra || urgente || fixado || novo ? (
          <span className="flex flex-wrap gap-1.5">
            {extra}
            {urgente ? <EtiquetaUrgente /> : null}
            {fixado ? <EtiquetaFixado /> : null}
            {novo ? <EtiquetaNovo /> : null}
          </span>
        ) : null}
        <b className="break-words font-display text-[1.08rem] leading-snug text-ink">{titulo}</b>
        <span className="break-words text-[0.95rem] text-ink-2">{resumir(texto, 140)}</span>
        {data ? <span className="text-[0.84rem] text-muted">{data}</span> : null}
      </span>
      <ChevronRight aria-hidden className="mt-1 size-5 shrink-0 text-muted" />
    </Link>
  );
}
