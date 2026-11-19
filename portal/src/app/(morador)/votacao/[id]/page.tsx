import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Download, EyeOff } from "lucide-react";
import { exigirPermissao } from "@/server/contexto";
import { obterEleicaoMorador } from "@/server/dados/eleicoes";
import { casas, diaMes, participacao } from "@/lib/enquetes";
import { regraTexto } from "@/lib/eleicoes";
import { formatarDataHora } from "@/lib/formato";
import { idDocumento } from "@/lib/validacao";
import { Alerta, Cartao } from "@/components/ui/basicos";
import { CabecalhoPagina, TituloSecao } from "@/components/ui/painel";
import {
  EtiquetaEleicao,
  ListaCandidatos,
  NotaSigilo,
  ResultadoEleicao,
} from "@/components/eleicoes/pecas";
import { Cedula } from "@/components/eleicoes/cedula";

export const metadata: Metadata = { title: "Votação oficial" };

/**
 * Uma eleição para o morador: a cédula (quando aberta e a casa ainda não votou),
 * a confirmação de que a casa votou (nunca em quem) e o resultado no encerramento.
 */
export default async function EleicaoMoradorPagina({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const valido = idDocumento.safeParse(id).success;
  const ctx = await exigirPermissao(
    "eleicoes.votar",
    valido ? `/votacao/${id}` : "/votacao",
  );
  if (!valido) notFound();
  const e = await obterEleicaoMorador(ctx, id);
  if (!e) notFound();

  const podeVotar =
    e.situacao === "aberta" && !e.casaVotou && !!ctx.unitId && !e.casaBloqueada;

  return (
    <div className="flex flex-col gap-5">
      <Link
        href="/votacao"
        className="flex min-h-11 w-fit items-center gap-1.5 font-bold text-lake"
      >
        <ArrowLeft aria-hidden className="size-4" /> Votação oficial
      </Link>

      <CabecalhoPagina
        sobretitulo={e.cargo}
        titulo={e.titulo}
        subtitulo={`${regraTexto(e)} · um voto por casa`}
      >
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <EtiquetaEleicao situacao={e.situacao} />
          <span className="text-[0.9rem] text-muted">
            {e.situacao === "agendada"
              ? `Abre ${formatarDataHora(e.abreEm, ctx.fuso)}`
              : e.situacao === "aberta"
                ? `Vote até ${formatarDataHora(e.fechaEm, ctx.fuso)}`
                : `Encerrada ${formatarDataHora(e.fechaEm, ctx.fuso)}`}
          </span>
        </div>
      </CabecalhoPagina>

      {e.casaVotou ? (
        <Alerta tipo="sucesso" titulo="Sua casa já votou">
          O voto da sua casa foi registrado
          {e.casaVotouEm ? ` em ${diaMes(e.casaVotouEm, ctx.fuso)}` : ""}. Ele é
          secreto e não pode ser mudado.
          <a
            href={`/votacao/${e.id}/comprovante`}
            download
            className="mt-2 flex w-fit min-h-11 items-center gap-2 font-bold text-pine underline underline-offset-4"
          >
            <Download aria-hidden className="size-4" /> Baixar comprovante (PDF)
          </a>
        </Alerta>
      ) : null}

      {e.casaBloqueada && !e.casaVotou && e.situacao !== "encerrada" ? (
        <Alerta tipo="aviso" titulo="Sua casa não está liberada para votar">
          A comissão eleitoral bloqueou a sua casa nesta eleição. Para saber o
          motivo ou regularizar, fale com a comissão.
        </Alerta>
      ) : podeVotar ? (
        <Cartao>
          <Cedula
            eleicaoId={e.id}
            modo={e.modo}
            candidatos={e.candidatos}
            escolhasPorCasa={e.escolhasPorCasa}
            permiteBranco={e.permiteBranco}
          />
        </Cartao>
      ) : e.situacao === "aberta" && !e.casaVotou && !ctx.unitId ? (
        <Alerta tipo="aviso" titulo="Seu cadastro não está ligado a uma casa">
          Para votar, peça à administração para ligar seu cadastro à sua casa.
        </Alerta>
      ) : e.situacao === "agendada" ? (
        <Alerta tipo="info" titulo="A votação ainda não abriu">
          Volte a partir de {formatarDataHora(e.abreEm, ctx.fuso)} para votar.
          Enquanto isso, conheça os candidatos.
        </Alerta>
      ) : e.situacao === "encerrada" && !e.casaVotou ? (
        <Alerta tipo="info" titulo="Votação encerrada">
          Sua casa não votou nesta eleição.
        </Alerta>
      ) : null}

      {e.resultado ? (
        <section
          aria-labelledby="titulo-resultado"
          className="flex flex-col gap-3"
        >
          <TituloSecao
            id="titulo-resultado"
            extra={`${casas(e.resultado.votaram)} de ${e.resultado.casasAptas} (${participacao(e.resultado.votaram, e.resultado.casasAptas)}%)`}
          >
            Resultado final
          </TituloSecao>
          <Cartao>
            <ResultadoEleicao apuracao={e.resultado.apuracao} vagas={e.vagas} />
          </Cartao>
        </section>
      ) : null}

      {e.resultado && e.modo === "chapa" ? (
        <section
          aria-labelledby="titulo-integrantes"
          className="flex flex-col gap-3"
        >
          <TituloSecao id="titulo-integrantes">
            Integrantes da chapa
          </TituloSecao>
          <ListaCandidatos candidatos={e.candidatos} numerado={false} />
        </section>
      ) : null}

      {!e.resultado ? (
        <>
          {!podeVotar ? (
            <section
              aria-labelledby="titulo-candidatos"
              className="flex flex-col gap-3"
            >
              <TituloSecao
                id="titulo-candidatos"
                extra={`${e.candidatos.length}`}
              >
                {e.modo === "chapa" ? "Integrantes da chapa" : "Candidatos"}
              </TituloSecao>
              <ListaCandidatos
                candidatos={e.candidatos}
                numerado={e.modo !== "chapa"}
              />
            </section>
          ) : null}
          <Cartao className="flex items-start gap-3 text-ink-2">
            <EyeOff aria-hidden className="mt-0.5 size-5 shrink-0 text-muted" />
            {e.situacao === "encerrada" ? (
              <p>
                A votação encerrou e os votos estão sendo apurados. O resultado
                aparece aqui em até 2 minutos.
              </p>
            ) : (
              <p>
                O resultado aparece quando a votação encerrar, em{" "}
                {formatarDataHora(e.fechaEm, ctx.fuso)}. Até lá ninguém vê
                parcial — nem a comissão.
              </p>
            )}
          </Cartao>
        </>
      ) : null}

      <NotaSigilo />
    </div>
  );
}
