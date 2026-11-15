import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, Vote } from "lucide-react";
import { exigirPermissao } from "@/server/contexto";
import { listarEnquetesMorador, type EnqueteMorador } from "@/server/dados/enquetes";
import { formatarDataHora } from "@/lib/formato";
import { Alerta, EstadoVazio } from "@/components/ui/basicos";
import { CabecalhoPagina, TituloSecao } from "@/components/ui/painel";
import { EtiquetaEnquete, EtiquetaVotou } from "@/components/enquetes/pecas";

export const metadata: Metadata = { title: "Enquetes" };

/** Enquetes do condomínio para o morador: abertas primeiro, depois as encerradas. */
export default async function EnquetesMorador() {
  const ctx = await exigirPermissao("enquetes.votar", "/enquetes");
  const enquetes = await listarEnquetesMorador(ctx);
  const emAndamento = enquetes.filter((e) => e.situacao === "aberta" || e.situacao === "agendada");
  const encerradas = enquetes.filter((e) => e.situacao === "encerrada");

  return (
    <div className="flex flex-col gap-5">
      <CabecalhoPagina
        sobretitulo="Participação"
        titulo="Enquetes"
        subtitulo="Ajude a decidir as coisas do condomínio. Vale um voto por casa."
      />

      {!ctx.unitId ? (
        <Alerta tipo="aviso" titulo="Seu cadastro não está ligado a uma casa">
          Para votar, peça à administração para ligar seu cadastro à sua casa.
        </Alerta>
      ) : null}

      <section aria-labelledby="titulo-abertas" className="flex flex-col gap-3">
        <TituloSecao id="titulo-abertas">Em andamento</TituloSecao>
        {emAndamento.length ? (
          <ul className="flex flex-col gap-2.5">
            {emAndamento.map((e) => (
              <li key={e.id}>
                <ItemEnquete enquete={e} fuso={ctx.fuso} />
              </li>
            ))}
          </ul>
        ) : (
          <EstadoVazio icone={Vote} titulo="Nenhuma votação aberta agora">
            Quando a administração abrir uma enquete, ela aparece aqui e no Início.
          </EstadoVazio>
        )}
      </section>

      {encerradas.length ? (
        <section aria-labelledby="titulo-encerradas" className="flex flex-col gap-3">
          <TituloSecao id="titulo-encerradas">Encerradas</TituloSecao>
          <ul className="flex flex-col gap-2.5">
            {encerradas.map((e) => (
              <li key={e.id}>
                <ItemEnquete enquete={e} fuso={ctx.fuso} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

function ItemEnquete({ enquete: e, fuso }: { enquete: EnqueteMorador; fuso: string }) {
  const prazo =
    e.situacao === "agendada"
      ? `Abre ${formatarDataHora(e.abreEm, fuso)}`
      : e.situacao === "aberta"
        ? `Vote até ${formatarDataHora(e.fechaEm, fuso)}`
        : "Veja o resultado";
  return (
    <Link href={`/enquetes/${e.id}`} className="saltado flex items-center gap-3 rounded-2xl p-4 transition-shadow active:shadow-afundado">
      <span className="min-w-0 flex-1">
        <span className="mb-1.5 flex flex-wrap items-center gap-2">
          <EtiquetaEnquete situacao={e.situacao} />
          {e.meuVoto ? <EtiquetaVotou /> : null}
        </span>
        <b className="block break-words text-ink">{e.pergunta}</b>
        <span className="block text-[0.9rem] text-ink-2">{prazo}</span>
      </span>
      <ChevronRight aria-hidden className="size-5 shrink-0 text-pine" />
    </Link>
  );
}
