import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  EyeOff,
  MessageCircle,
  Pencil,
  Printer,
  Send,
  Undo2,
} from "lucide-react";
import { exigirPermissao } from "@/server/contexto";
import { casasParaBloqueio, obterEleicaoGestao } from "@/server/dados/eleicoes";
import {
  publicarEleicao,
  voltarEleicaoParaRascunho,
} from "@/server/acoes/eleicoes";
import { casas, participacao } from "@/lib/enquetes";
import { ROTULO_DESEMPATE, textoEscolhas, vagasTexto } from "@/lib/eleicoes";
import { formatarDataHora } from "@/lib/formato";
import { idDocumento } from "@/lib/validacao";
import { Alerta, Cartao, TituloPagina } from "@/components/ui/basicos";
import { BotaoLink } from "@/components/ui/botao";
import { AcaoConfirmada } from "@/components/ui/acao-confirmada";
import { BlocoNumero, TituloSecao } from "@/components/ui/painel";
import {
  EtiquetaEleicao,
  ListaCandidatos,
  NotaSigilo,
  ResultadoEleicao,
} from "@/components/eleicoes/pecas";
import { BloqueioCasas } from "@/components/eleicoes/bloqueio-casas";
import {
  MapaVotacao,
  type SituacaoCasaMapa,
} from "@/components/eleicoes/mapa-votacao";

export const metadata: Metadata = { title: "Votação oficial" };

/**
 * Detalhe da eleição para a comissão: regras, candidatos, publicar,
 * participação (quais casas já votaram, por número) e a apuração no encerramento.
 * Nunca mostra o voto de uma casa nem parcial antes do fim.
 */
export default async function EleicaoGestaoPagina({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const ctx = await exigirPermissao("eleicoes.gerenciar");
  const { id } = await params;
  if (!idDocumento.safeParse(id).success) notFound();
  const e = await obterEleicaoGestao(ctx, id);
  if (!e) notFound();

  const rascunho = e.status === "rascunho";
  const podeBloquear = e.situacao !== "encerrada";
  const casasDaEleicao = await casasParaBloqueio(ctx, e.id);
  // Mapa: situação de cada casa pelo número do lote (nunca o voto).
  const situacoes = new Map<number, SituacaoCasaMapa>();
  for (const c of casasDaEleicao) {
    if (c.numero === null) continue;
    situacoes.set(
      c.numero,
      !c.ativa
        ? "inativa"
        : c.votou
          ? "votou"
          : c.bloqueada
            ? "bloqueada"
            : "falta",
    );
  }
  const faltam = Math.max(0, e.casasAptas - e.votaram);

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <Link
        href="/admin/votacao"
        className="flex min-h-11 w-fit items-center gap-1.5 font-bold text-lake"
      >
        <ArrowLeft aria-hidden className="size-4" /> Votação oficial
      </Link>

      <TituloPagina
        sobretitulo={e.cargo}
        titulo={e.titulo}
        acoes={<EtiquetaEleicao situacao={e.situacao} />}
      />

      {e.situacao !== "encerrada" ? (
        <div>
          <BotaoLink
            href={`/admin/votacao/${e.id}/links`}
            icone={<MessageCircle aria-hidden className="size-5" />}
          >
            Links de voto e WhatsApp
          </BotaoLink>
        </div>
      ) : null}

      <Cartao className="flex flex-col gap-2 text-ink-2">
        <p>
          <b className="text-ink">Abre:</b>{" "}
          {formatarDataHora(e.abreEm, ctx.fuso)}
        </p>
        <p>
          <b className="text-ink">Encerra:</b>{" "}
          {formatarDataHora(e.fechaEm, ctx.fuso)}
        </p>
        {e.modo === "chapa" ? (
          <p>
            <b className="text-ink">Regras:</b> chapa única · cada casa responde
            Sim ou Não · eleita com metade mais 1 dos votos
          </p>
        ) : (
          <>
            <p>
              <b className="text-ink">Regras:</b> {vagasTexto(e.vagas)} ·{" "}
              {textoEscolhas(e.escolhasPorCasa).toLowerCase()} por casa ·{" "}
              {e.permiteBranco ? "aceita voto em branco" : "sem voto em branco"}
            </p>
            <p>
              <b className="text-ink">Desempate:</b>{" "}
              {ROTULO_DESEMPATE[e.regraDesempate]}
            </p>
          </>
        )}
        {e.criadoPorNome ? (
          <p className="text-[0.9rem] text-muted">
            Criada por {e.criadoPorNome}.
          </p>
        ) : null}

        {rascunho ? (
          <div className="mt-2 flex flex-wrap gap-2">
            <BotaoLink
              href={`/admin/votacao/${e.id}/editar`}
              variante="secundario"
              icone={<Pencil aria-hidden className="size-4" />}
            >
              Editar rascunho
            </BotaoLink>
            <AcaoConfirmada
              acao={publicarEleicao}
              campos={{ id: e.id }}
              titulo="Publicar esta votação?"
              mensagem={`Os moradores passam a ver os candidatos e podem votar de ${formatarDataHora(e.abreEm, ctx.fuso)} até ${formatarDataHora(e.fechaEm, ctx.fuso)}. Depois de abrir, regras e candidatos não mudam mais.`}
              textoConfirmar="Sim, publicar"
              variante="primario"
            >
              <Send aria-hidden className="size-4" /> Publicar
            </AcaoConfirmada>
          </div>
        ) : e.situacao === "agendada" ? (
          <div className="mt-2">
            <AcaoConfirmada
              acao={voltarEleicaoParaRascunho}
              campos={{ id: e.id }}
              titulo="Voltar para rascunho?"
              mensagem="Os moradores deixam de ver a votação até você publicar de novo. Use para corrigir algo antes de abrir."
              textoConfirmar="Sim, voltar"
              variante="secundario"
            >
              <Undo2 aria-hidden className="size-4" /> Voltar para rascunho
            </AcaoConfirmada>
          </div>
        ) : null}
      </Cartao>

      {rascunho ? (
        <Alerta tipo="aviso" titulo="Ainda é rascunho">
          Os moradores não veem esta votação. Confira os candidatos e toque em
          “Publicar”.
        </Alerta>
      ) : null}

      {e.apuracao ? (
        <section
          aria-labelledby="titulo-resultado"
          className="flex flex-col gap-3"
        >
          <TituloSecao id="titulo-resultado" extra="resultado final">
            Apuração
          </TituloSecao>
          <Cartao>
            <ResultadoEleicao apuracao={e.apuracao} vagas={e.vagas} />
          </Cartao>
          <div>
            <BotaoLink
              href={`/relatorio/votacao/${e.id}`}
              variante="secundario"
              icone={<Printer aria-hidden className="size-4" />}
            >
              Imprimir ata
            </BotaoLink>
          </div>
        </section>
      ) : null}

      <section
        aria-labelledby="titulo-candidatos"
        className="flex flex-col gap-3"
      >
        <TituloSecao id="titulo-candidatos" extra={`${e.candidatos.length}`}>
          {e.modo === "chapa" ? "Integrantes da chapa" : "Candidatos"}
        </TituloSecao>
        <ListaCandidatos
          candidatos={e.candidatos}
          numerado={e.modo !== "chapa"}
        />
      </section>

      {!rascunho ? (
        <section
          aria-labelledby="titulo-participacao"
          className="flex flex-col gap-3"
        >
          <TituloSecao id="titulo-participacao">Participação</TituloSecao>
          <div className="grid grid-cols-3 gap-2.5">
            <BlocoNumero
              rotulo="Votaram"
              valor={e.votaram}
              detalhe={`de ${casas(e.casasAptas)}`}
              cor="pine"
            />
            <BlocoNumero
              rotulo="Participação"
              valor={`${participacao(e.votaram, e.casasAptas)}%`}
              detalhe="das casas aptas"
              cor="lake"
            />
            <BlocoNumero
              rotulo="Faltam"
              valor={faltam}
              detalhe={faltam === 1 ? "casa" : "casas"}
              cor="ink"
            />
          </div>
          <Cartao className="flex flex-col gap-3">
            <p className="text-[0.95rem] font-bold text-ink-2">
              Mapa: quem já votou e quem falta
            </p>
            <MapaVotacao situacoes={situacoes} />
          </Cartao>
          {!e.apuracao ? (
            <p className="flex items-start gap-2 text-[0.9rem] text-muted">
              <EyeOff aria-hidden className="mt-0.5 size-4 shrink-0" />
              {e.situacao === "encerrada"
                ? "Apurando: a soma dos votos é aberta 2 minutos depois do encerramento. Atualize a página."
                : "Não existe parcial: a soma dos votos só é aberta depois do encerramento."}
            </p>
          ) : null}
        </section>
      ) : null}

      {podeBloquear ? (
        <section
          aria-labelledby="titulo-bloqueio"
          className="flex flex-col gap-3"
        >
          <TituloSecao
            id="titulo-bloqueio"
            extra={
              e.casasBloqueadas.length
                ? `${e.casasBloqueadas.length} bloqueadas`
                : undefined
            }
          >
            Casas bloqueadas de votar
          </TituloSecao>
          <Cartao>
            <BloqueioCasas eleicaoId={e.id} casas={casasDaEleicao} />
          </Cartao>
        </section>
      ) : e.casasBloqueadas.length ? (
        <p className="text-[0.9rem] text-muted">
          {e.casasBloqueadas.length}{" "}
          {e.casasBloqueadas.length === 1
            ? "casa ficou bloqueada"
            : "casas ficaram bloqueadas"}{" "}
          nesta eleição.
        </p>
      ) : null}

      <NotaSigilo />
    </div>
  );
}
