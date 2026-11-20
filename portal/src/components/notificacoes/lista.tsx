/**
 * Lista de notificações (o conteúdo do sino e da página "Notificações").
 * Serve para o servidor e para o navegador: não guarda estado.
 * Cada item: ícone do assunto, título, texto, há quanto tempo e a marca "Novo".
 */
import Link from "next/link";
import {
  Award,
  CalendarDays,
  ChevronRight,
  ClipboardList,
  FolderOpen,
  Megaphone,
  PartyPopper,
  Store,
  UserCheck,
  Vote,
  type LucideIcon,
} from "lucide-react";
import { cx } from "@/lib/cx";
import { ehNova, quandoFoi, separarNotificacoes, type Notificacao, type TipoNotificacao, type TomNotificacao } from "@/lib/notificacoes";

const ICONE: Record<TipoNotificacao, LucideIcon> = {
  anuncio_pendente: Store,
  reserva_pendente: CalendarDays,
  solicitacao_aberta: ClipboardList,
  votacao: Award,
  enquete: Vote,
  comunicado: Megaphone,
  documento: FolderOpen,
  anuncio_decidido: Store,
  reserva_decidida: CalendarDays,
  solicitacao_respondida: ClipboardList,
  visita_autorizada: UserCheck,
};

const COR: Record<TomNotificacao, string> = {
  ok: "bg-ok-soft text-pine",
  info: "bg-lake-soft text-lake",
  aviso: "bg-warn-soft text-warn",
  erro: "bg-danger-soft text-danger",
  destaque: "bg-plum-soft text-plum",
  neutro: "bg-surface-2 text-ink-2",
};

function Item({ n, nova, agora, fuso }: { n: Notificacao; nova: boolean; agora: number; fuso?: string }) {
  const Icone = ICONE[n.tipo];
  return (
    <li>
      <Link
        href={n.href}
        className={cx(
          "flex items-start gap-3 rounded-2xl border px-3 py-3 transition-shadow active:shadow-afundado",
          nova ? "border-borda-luz bg-surface shadow-relevo" : "border-transparent hover:bg-surface",
        )}
      >
        <span className={cx("grid size-10 shrink-0 place-items-center rounded-[12px]", COR[n.tom])}>
          <Icone aria-hidden className="size-5" />
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="flex items-start justify-between gap-2">
            <b className="min-w-0 break-words leading-snug text-ink">{n.titulo}</b>
            {nova ? (
              <span className="mt-0.5 shrink-0 rounded-full bg-plum px-2 py-0.5 text-[0.7rem] font-bold uppercase tracking-wide text-white">
                Novo
              </span>
            ) : null}
          </span>
          <span className="break-words text-[0.92rem] leading-snug text-ink-2">{n.texto}</span>
          <span className="text-[0.8rem] text-muted">{quandoFoi(n.quando, agora, fuso)}</span>
        </span>
        <ChevronRight aria-hidden className="mt-2.5 size-4 shrink-0 text-muted" />
      </Link>
    </li>
  );
}

export function ListaNotificacoes({
  itens,
  vistasEm,
  agora,
  fuso,
  vazio = "Nada novo por aqui. Quando houver algo para você, aparece aqui.",
}: {
  itens: readonly Notificacao[];
  /** Quando a pessoa abriu o sino pela última vez (antes desta vez). */
  vistasEm: number | null;
  agora: number;
  fuso?: string;
  vazio?: string;
}) {
  if (!itens.length) {
    return (
      <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
        <PartyPopper aria-hidden className="size-8 text-pine" />
        <p className="font-bold text-ink">Tudo em dia</p>
        <p className="text-[0.92rem] text-muted">{vazio}</p>
      </div>
    );
  }
  const { acao, outras } = separarNotificacoes(itens);
  return (
    <div className="flex flex-col gap-4">
      {acao.length ? (
        <section aria-label="Precisa de você" className="flex flex-col gap-1.5">
          <h3 className="px-1 text-[0.8rem] font-bold uppercase tracking-wide text-plum">Precisa de você · {acao.length}</h3>
          <ul className="flex flex-col gap-1.5">
            {acao.map((n) => (
              <Item key={n.id} n={n} nova={ehNova(n, vistasEm)} agora={agora} fuso={fuso} />
            ))}
          </ul>
        </section>
      ) : null}
      {outras.length ? (
        <section aria-label="Novidades" className="flex flex-col gap-1.5">
          <h3 className="px-1 text-[0.8rem] font-bold uppercase tracking-wide text-muted">Novidades</h3>
          <ul className="flex flex-col gap-1.5">
            {outras.map((n) => (
              <Item key={n.id} n={n} nova={ehNova(n, vistasEm)} agora={agora} fuso={fuso} />
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
