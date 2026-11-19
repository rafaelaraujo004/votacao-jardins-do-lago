import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, Vote } from "lucide-react";
import { exigirPermissao } from "@/server/contexto";
import {
  listarEleicoesMorador,
  type EleicaoMorador,
} from "@/server/dados/eleicoes";
import { regraTexto } from "@/lib/eleicoes";
import { formatarDataHora } from "@/lib/formato";
import { Alerta, EstadoVazio } from "@/components/ui/basicos";
import { CabecalhoPagina, TituloSecao } from "@/components/ui/painel";
import {
  EtiquetaCasaVotou,
  EtiquetaEleicao,
  NotaSigilo,
} from "@/components/eleicoes/pecas";

export const metadata: Metadata = { title: "Votação oficial" };

/** Votações oficiais publicadas: abertas primeiro, depois agendadas e encerradas. */
export default async function VotacaoMorador() {
  const ctx = await exigirPermissao("eleicoes.votar", "/votacao");
  const eleicoes = await listarEleicoesMorador(ctx);
  const emAndamento = eleicoes.filter(
    (e) => e.situacao === "aberta" || e.situacao === "agendada",
  );
  const encerradas = eleicoes.filter((e) => e.situacao === "encerrada");

  return (
    <div className="flex flex-col gap-5">
      <CabecalhoPagina
        sobretitulo="Participação"
        titulo="Votação oficial"
        subtitulo="Eleições do condomínio. Vale um voto por casa e o voto é secreto."
      />

      {!ctx.unitId ? (
        <Alerta tipo="aviso" titulo="Seu cadastro não está ligado a uma casa">
          Para votar, peça à administração para ligar seu cadastro à sua casa.
        </Alerta>
      ) : null}

      <section
        aria-labelledby="titulo-andamento"
        className="flex flex-col gap-3"
      >
        <TituloSecao id="titulo-andamento">Em andamento</TituloSecao>
        {emAndamento.length ? (
          <ul className="flex flex-col gap-2.5">
            {emAndamento.map((e) => (
              <li key={e.id}>
                <ItemEleicao eleicao={e} fuso={ctx.fuso} />
              </li>
            ))}
          </ul>
        ) : (
          <EstadoVazio icone={Vote} titulo="Nenhuma votação aberta agora">
            Quando a comissão publicar uma eleição, ela aparece aqui e no
            Início.
          </EstadoVazio>
        )}
      </section>

      {encerradas.length ? (
        <section
          aria-labelledby="titulo-encerradas"
          className="flex flex-col gap-3"
        >
          <TituloSecao id="titulo-encerradas">Resultados</TituloSecao>
          <ul className="flex flex-col gap-2.5">
            {encerradas.map((e) => (
              <li key={e.id}>
                <ItemEleicao eleicao={e} fuso={ctx.fuso} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <NotaSigilo />
    </div>
  );
}

function ItemEleicao({
  eleicao: e,
  fuso,
}: {
  eleicao: EleicaoMorador;
  fuso: string;
}) {
  const prazo =
    e.situacao === "agendada"
      ? `Abre ${formatarDataHora(e.abreEm, fuso)}`
      : e.situacao === "aberta"
        ? `Vote até ${formatarDataHora(e.fechaEm, fuso)}`
        : "Veja o resultado";
  return (
    <Link
      href={`/votacao/${e.id}`}
      className="saltado flex items-center gap-3 rounded-2xl p-4 transition-shadow active:shadow-afundado"
    >
      <span className="min-w-0 flex-1">
        <span className="mb-1.5 flex flex-wrap items-center gap-2">
          <EtiquetaEleicao situacao={e.situacao} />
          {e.casaVotou ? <EtiquetaCasaVotou /> : null}
        </span>
        <b className="block break-words text-ink">{e.titulo}</b>
        <span className="block text-[0.9rem] text-ink-2">
          {e.cargo} · {regraTexto(e)} · {prazo}
        </span>
      </span>
      <ChevronRight aria-hidden className="size-5 shrink-0 text-pine" />
    </Link>
  );
}
