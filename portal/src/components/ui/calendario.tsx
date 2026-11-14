"use client";

/**
 * Calendário do mês (semana começando no domingo).
 * Hoje fica em destaque verde; dias com evento ganham pontinhos coloridos.
 * Ao tocar num dia marcado, a linha abaixo da grade diz o que acontece nele.
 */
import { useState } from "react";
import { COR_EVENTO, LEGENDA_AGENDA, dataISO, diaDaSemana, diasNoMes, type EventoAgenda } from "@/lib/agenda";
import { cx } from "@/lib/cx";

const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const LETRAS = ["D", "S", "T", "Q", "Q", "S", "S"];
const DIAS_LONGOS = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];

export function Calendario({
  ano,
  mes,
  hoje,
  eventos,
}: {
  ano: number;
  /** de 1 a 12 */
  mes: number;
  /** dia de hoje (1 a 31) se o mês mostrado for o atual; senão null */
  hoje: number | null;
  eventos: EventoAgenda[];
}) {
  const [escolhido, setEscolhido] = useState<number | null>(null);

  const primeiro = diaDaSemana(ano, mes, 1);
  const total = diasNoMes(ano, mes);
  const nomeMes = MESES[mes - 1];
  const doDia = (dia: number) => eventos.filter((e) => e.data === dataISO(ano, mes, dia));

  // Texto da linha de informação (lida em voz alta por leitores de tela).
  function descrever(dia: number): string {
    const lista = doDia(dia);
    const quando = `${DIAS_LONGOS[diaDaSemana(ano, mes, dia)]}, ${dia} de ${nomeMes}${dia === hoje ? " (hoje)" : ""}`;
    return `${quando}: ${lista.length ? lista.map((e) => e.titulo).join(" e ") : "nenhum evento"}.`;
  }

  const info = escolhido ? descrever(escolhido) : hoje ? descrever(hoje) : "Toque num dia com ponto para ver o evento.";

  return (
    <div>
      <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
        <b className="font-display text-[1.15rem] font-extrabold capitalize text-destaque">
          {nomeMes}/{ano}
        </b>
        <span className="text-[0.82rem] text-muted">toque num dia com ponto</span>
      </div>

      <div className="grid grid-cols-7 gap-[3px] text-center">
        {LETRAS.map((l, i) => (
          <abbr key={i} title={DIAS_LONGOS[i]} className="pb-1.5 text-[0.75rem] font-bold text-ink-2 no-underline">
            {l}
          </abbr>
        ))}
        {/* espaços vazios antes do dia 1 */}
        {Array.from({ length: primeiro }, (_, i) => (
          <span key={`v${i}`} aria-hidden />
        ))}
        {Array.from({ length: total }, (_, i) => {
          const dia = i + 1;
          const lista = doDia(dia);
          const ehHoje = dia === hoje;
          const domingo = diaDaSemana(ano, mes, dia) === 0;
          const passado = hoje !== null && dia < hoje;
          const classes = cx(
            "relative mx-auto flex h-11 w-full max-w-11 flex-col items-center justify-center rounded-full text-[0.95rem]",
            ehHoje
              ? "botao-verde font-extrabold"
              : cx(passado ? "text-muted" : domingo ? "text-plum" : "text-ink", escolhido === dia && "afundado"),
          );
          const pontos = lista.length ? (
            <span aria-hidden className="absolute inset-x-0 bottom-1 flex justify-center gap-[3px]">
              {lista.map((e) => (
                <i key={e.id} className={cx("size-[7px] rounded-full", COR_EVENTO[e.tipo])} />
              ))}
            </span>
          ) : null;

          // Só vira botão quando tem algo para mostrar (evento ou hoje).
          if (!lista.length && !ehHoje) {
            return (
              <span key={dia} className={classes}>
                {dia}
              </span>
            );
          }
          const rotulo =
            `${dia} de ${nomeMes}${ehHoje ? ", hoje" : ""}: ` +
            (lista.length ? lista.map((e) => e.titulo).join(", ") : "sem eventos");
          return (
            <button
              key={dia}
              type="button"
              aria-label={rotulo}
              aria-pressed={escolhido === dia}
              onClick={() => setEscolhido(dia)}
              className={cx(classes, "font-bold active:shadow-afundado")}
            >
              {dia}
              {pontos}
            </button>
          );
        })}
      </div>

      <p aria-live="polite" className="mx-0.5 mt-2.5 min-h-[1.4em] text-[0.92rem] font-bold text-destaque">
        {info}
      </p>

      <ul className="mt-3 flex flex-wrap gap-x-3.5 gap-y-1.5 text-[0.85rem] text-muted">
        {LEGENDA_AGENDA.map((l) => (
          <li key={l.texto} className="inline-flex items-center gap-1.5">
            <i aria-hidden className={cx("size-[9px] rounded-full", l.cor)} />
            {l.texto}
          </li>
        ))}
      </ul>
    </div>
  );
}
