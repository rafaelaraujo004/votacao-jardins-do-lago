/**
 * Calendário do mês das reservas (mesmo visual de components/ui/calendario.tsx).
 * Cada dia que pode ser escolhido é um LINK: funciona até sem JavaScript e o
 * dia escolhido fica no endereço (dá para voltar e compartilhar).
 */
import Link from "next/link";
import type { ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { dataISO, diaDaSemana, diasNoMes } from "@/lib/agenda";
import { cx } from "@/lib/cx";

const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const LETRAS = ["D", "S", "T", "Q", "Q", "S", "S"];
const DIAS_LONGOS = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];

export type InfoDia = {
  /** Classes de cor dos pontinhos (ex.: "bg-petala-verde"). */
  pontos?: string[];
  /** Texto lido pelo leitor de tela (ex.: "2 reservas"). */
  descricao?: string;
  /** Dia sem horário livre: aparece riscado. */
  lotado?: boolean;
  /** Não pode ser escolhido (fora da antecedência, por exemplo). */
  desativado?: boolean;
};

export function CalendarioReservas({
  mes,
  hoje,
  selecionado,
  dias,
  hrefDia,
  hrefAnterior,
  hrefProximo,
  rodape,
}: {
  /** "AAAA-MM" */
  mes: string;
  /** "AAAA-MM-DD" (fuso do condomínio) */
  hoje: string;
  selecionado: string | null;
  /** Informações por data "AAAA-MM-DD". */
  dias: Record<string, InfoDia>;
  hrefDia: (data: string) => string;
  hrefAnterior: string | null;
  hrefProximo: string | null;
  rodape?: ReactNode;
}) {
  const [ano, numeroMes] = mes.split("-").map(Number);
  const primeiro = diaDaSemana(ano, numeroMes, 1);
  const total = diasNoMes(ano, numeroMes);
  const nomeMes = MESES[numeroMes - 1];
  const seta = "grid size-11 shrink-0 place-items-center rounded-full text-destaque";

  return (
    <div>
      <div className="mb-2.5 flex items-center justify-between gap-2">
        {hrefAnterior ? (
          <Link href={hrefAnterior} scroll={false} aria-label="Mês anterior" className={cx(seta, "saltado active:shadow-afundado")}>
            <ChevronLeft aria-hidden className="size-6" />
          </Link>
        ) : (
          <span aria-hidden className={cx(seta, "opacity-30")}>
            <ChevronLeft className="size-6" />
          </span>
        )}
        <b className="font-display text-[1.15rem] font-extrabold capitalize text-destaque">
          {nomeMes}/{ano}
        </b>
        {hrefProximo ? (
          <Link href={hrefProximo} scroll={false} aria-label="Próximo mês" className={cx(seta, "saltado active:shadow-afundado")}>
            <ChevronRight aria-hidden className="size-6" />
          </Link>
        ) : (
          <span aria-hidden className={cx(seta, "opacity-30")}>
            <ChevronRight className="size-6" />
          </span>
        )}
      </div>

      <div className="grid grid-cols-7 gap-[3px] text-center">
        {LETRAS.map((l, i) => (
          <abbr key={i} title={DIAS_LONGOS[i]} className="pb-1.5 text-[0.75rem] font-bold text-ink-2 no-underline">
            {l}
          </abbr>
        ))}
        {Array.from({ length: primeiro }, (_, i) => (
          <span key={`v${i}`} aria-hidden />
        ))}
        {Array.from({ length: total }, (_, i) => {
          const dia = i + 1;
          const data = dataISO(ano, numeroMes, dia);
          const info = dias[data] ?? {};
          const ehHoje = data === hoje;
          const escolhido = data === selecionado;
          const passado = data < hoje;
          const domingo = diaDaSemana(ano, numeroMes, dia) === 0;
          const classes = cx(
            "relative mx-auto flex h-11 w-full max-w-11 flex-col items-center justify-center rounded-full text-[0.95rem]",
            escolhido
              ? "botao-verde font-extrabold"
              : cx(
                  passado || info.desativado ? "text-muted" : domingo ? "text-plum" : "text-ink",
                  ehHoje && "afundado font-extrabold",
                  info.lotado && "line-through",
                ),
          );
          const pontos = info.pontos?.length ? (
            <span aria-hidden className="absolute inset-x-0 bottom-1 flex justify-center gap-[3px]">
              {info.pontos.slice(0, 3).map((cor, j) => (
                <i key={j} className={cx("size-[7px] rounded-full", cor)} />
              ))}
            </span>
          ) : null;

          if (info.desativado) {
            return (
              <span key={dia} className={classes}>
                {dia}
                {pontos}
              </span>
            );
          }
          const rotulo =
            `${DIAS_LONGOS[diaDaSemana(ano, numeroMes, dia)]}, ${dia} de ${nomeMes}${ehHoje ? " (hoje)" : ""}` +
            (info.descricao ? `: ${info.descricao}` : "");
          return (
            <Link
              key={dia}
              href={hrefDia(data)}
              scroll={false}
              aria-label={rotulo}
              aria-current={escolhido ? "date" : undefined}
              className={cx(classes, "font-bold transition-shadow active:shadow-afundado hover:bg-surface-2")}
            >
              {dia}
              {pontos}
            </Link>
          );
        })}
      </div>
      {rodape}
    </div>
  );
}
