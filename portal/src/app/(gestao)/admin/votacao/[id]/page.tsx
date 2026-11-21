import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  BellRing,
  CircleSlash,
  Clock3,
  EyeOff,
  FileText,
  Lock,
  MessageCircle,
  Pencil,
  Send,
  Undo2,
} from "lucide-react";
import { exigirPermissao } from "@/server/contexto";
import {
  bloqueioPodeMudar,
  casasParaBloqueio,
  obterEleicaoGestao,
} from "@/server/dados/eleicoes";
import {
  publicarEleicao,
  voltarEleicaoParaRascunho,
} from "@/server/acoes/eleicoes";
import { enderecoBase } from "@/server/endereco";
import { casas, participacao } from "@/lib/enquetes";
import {
  ROTULO_DESEMPATE,
  contarNulos,
  porcentagemParticipacao,
  resultadoParaPainel,
  textoEscolhas,
  vagasTexto,
  type ResultadoPainel,
} from "@/lib/eleicoes";
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
import { RevelacaoResultado } from "@/components/eleicoes/revelacao-resultado";
import { CompartilharResultado } from "@/components/eleicoes/compartilhar-resultado";
import { ArvoreChapa } from "@/components/eleicoes/arvore-chapa";
import { FotosChapa } from "@/components/eleicoes/fotos-chapa";
import {
  MapaVotacao,
  type SituacaoCasaMapa,
} from "@/components/eleicoes/mapa-votacao";

export const metadata: Metadata = { title: "Votação oficial" };

/** "21/11 às 17:02" no fuso do condomínio (sem o ano: é sempre a eleição do momento). */
function diaHora(data: Date, fuso: string): string {
  const [dia, hora] = formatarDataHora(data, fuso).split(" às ");
  return `${dia.slice(0, 5)} às ${hora}`;
}

const plural = (n: number, um: string, varios: string) =>
  `${n} ${n === 1 ? um : varios}`;

/**
 * Texto do resultado para o grupo do WhatsApp (montado aqui, no servidor).
 * Só totais do condomínio inteiro — nunca quais casas votaram.
 * Nulos = casas aptas que não votaram (decisão do síndico em 21/11/2026): aparecem,
 * mas não entram na conta da metade mais 1.
 */
function textoResultadoGrupo(p: {
  titulo: string;
  resultado: ResultadoPainel;
  votaram: number;
  casasAptas: number;
  nulos: number;
  endereco: string;
}): string {
  const r = p.resultado;
  const titulo = p.titulo.replace(/\*/g, "");
  const participou = `Votaram ${p.votaram} de ${plural(p.casasAptas, "casa", "casas")} (${porcentagemParticipacao(p.votaram, p.casasAptas)}%).`;
  if (r.modo === "chapa") {
    return [
      `🗳️ *Resultado — ${titulo}*`,
      r.eleita ? "✅ Chapa ELEITA" : "❌ Chapa NÃO eleita",
      `Sim: ${r.sim} (${r.porcentagemSim}%) · Não: ${r.nao} (${r.porcentagemNao}%) · Nulos: ${p.nulos}`,
      participou,
      "Regra: eleita com metade mais 1 dos votos válidos (Sim + Não). Nulos são as casas que não votaram e não entram na conta.",
      `Veja no portal: ${p.endereco}`,
    ].join("\n");
  }
  const eleitos = r.ranking.filter((l) => l.eleito);
  return [
    `🗳️ *Resultado — ${titulo}*`,
    eleitos.length ? "🏆 *Eleitos:*" : null,
    ...eleitos.map(
      (l) => `✅ ${l.numero} · ${l.nome} — ${plural(l.votos, "voto", "votos")}`,
    ),
    r.empate
      ? "⚖️ Houve empate na última vaga: a comissão decide e registra na ata."
      : null,
    `Brancos: ${r.brancos} · Nulos: ${p.nulos}`,
    participou,
    "Nulos são as casas que não votaram.",
    `Veja no portal: ${p.endereco}`,
  ]
    .filter((l) => l !== null)
    .join("\n");
}

/**
 * Detalhe da eleição para a comissão: regras, candidatos, publicar,
 * participação (quais casas já votaram, por número) e a apuração no encerramento.
 * Nunca mostra o voto de uma casa nem parcial antes do fim.
 *
 * Decisões de 21/11/2026: com a votação ABERTA o bloqueio de casas fica congelado
 * (só leitura); depois do encerramento, "Faltam" vira "Nulos"; o resultado ganha a
 * revelação animada, o envio para o grupo e o relatório final.
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
  const encerrada = e.situacao === "encerrada";
  // Bloqueio só muda ANTES de abrir; aberta, a lista fica congelada (o servidor também recusa).
  const podeBloquear = bloqueioPodeMudar(e);
  const [casasDaEleicao, endereco] = await Promise.all([
    casasParaBloqueio(ctx, e.id),
    enderecoBase(),
  ]);
  const bloqueadasAgora = casasDaEleicao.filter((c) => c.bloqueada);
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
  // Nulos: casas aptas que não votaram (só aparece depois do encerramento).
  const nulos = contarNulos(e.casasAptas, e.votaram);
  const resultado = e.apuracao ? resultadoParaPainel(e.apuracao) : null;
  const textoGrupo = resultado
    ? textoResultadoGrupo({
        titulo: e.titulo,
        resultado,
        votaram: e.votaram,
        casasAptas: e.casasAptas,
        nulos,
        endereco,
      })
    : "";

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
            Sim ou Não · eleita com metade mais 1 dos votos válidos (Sim + Não)
            · casas que não votarem contam como nulos e ficam fora da conta
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

      {e.apuracao && resultado ? (
        <section
          aria-labelledby="titulo-resultado"
          className="flex flex-col gap-3"
        >
          <TituloSecao id="titulo-resultado" extra="resultado final">
            Apuração
          </TituloSecao>
          <Cartao className="flex flex-col gap-4">
            <ResultadoEleicao apuracao={e.apuracao} vagas={e.vagas} />
            <p className="flex items-start gap-2 text-[0.92rem] text-ink-2">
              <CircleSlash
                aria-hidden
                className="mt-0.5 size-4 shrink-0 text-muted"
              />
              <span>
                <b className="text-ink">
                  {plural(nulos, "voto nulo", "votos nulos")}
                </b>{" "}
                (casas aptas que não votaram).{" "}
                {e.modo === "chapa"
                  ? "Não entram na conta da metade mais 1."
                  : "Não mudam a contagem dos candidatos."}
              </span>
            </p>
            <RevelacaoResultado
              eleicaoId={e.id}
              titulo={e.titulo}
              resultado={resultado}
              casasAptas={e.casasAptas}
              votaram={e.votaram}
            />
          </Cartao>
          {e.resultadoDivulgadoEm ? (
            <p className="flex items-start gap-2 text-[0.92rem] text-ink-2">
              <BellRing
                aria-hidden
                className="mt-0.5 size-4 shrink-0 text-pine"
              />
              <span>
                Resultado divulgado a todos em{" "}
                <b className="text-ink">
                  {diaHora(e.resultadoDivulgadoEm, ctx.fuso)}
                </b>{" "}
                (aviso no celular e no sino).
              </span>
            </p>
          ) : (
            <p
              role="status"
              className="flex items-start gap-2 text-[0.92rem] text-ink-2"
            >
              <Clock3
                aria-hidden
                className="mt-0.5 size-4 shrink-0 text-muted"
              />
              <span>
                Divulgando o resultado para todos… Atualize a página em
                instantes.
              </span>
            </p>
          )}
          <Cartao className="flex flex-col gap-3">
            <p className="text-[0.95rem] font-bold text-ink-2">
              Avisar no grupo do condomínio
            </p>
            <CompartilharResultado texto={textoGrupo} />
          </Cartao>
          <div>
            <BotaoLink
              href={`/relatorio/votacao/${e.id}`}
              variante="secundario"
              icone={<FileText aria-hidden className="size-4" />}
            >
              Relatório final (imprimir ou PDF)
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
        {e.modo === "chapa" ? (
          <Cartao>
            <ArvoreChapa candidatos={e.candidatos} fotos={e.fotos} />
          </Cartao>
        ) : (
          <ListaCandidatos candidatos={e.candidatos} />
        )}
      </section>

      {e.modo === "chapa" ? (
        <section aria-labelledby="titulo-fotos" className="flex flex-col gap-3">
          <TituloSecao id="titulo-fotos">Fotos da chapa</TituloSecao>
          <Cartao>
            <FotosChapa
              eleicaoId={e.id}
              candidatos={e.candidatos}
              fotos={e.fotos}
            />
          </Cartao>
        </section>
      ) : null}

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
            {encerrada ? (
              <BlocoNumero
                rotulo="Nulos"
                valor={nulos}
                detalhe="não votaram"
                cor="ink"
              />
            ) : (
              <BlocoNumero
                rotulo="Faltam"
                valor={faltam}
                detalhe={faltam === 1 ? "casa" : "casas"}
                cor="ink"
              />
            )}
          </div>
          <Cartao className="flex flex-col gap-3">
            <p className="text-[0.95rem] font-bold text-ink-2">
              {encerrada
                ? "Mapa: quem votou e quem não votou"
                : "Mapa: quem já votou e quem falta"}
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
      ) : !encerrada ? (
        <section
          aria-labelledby="titulo-bloqueio"
          className="flex flex-col gap-3"
        >
          <TituloSecao
            id="titulo-bloqueio"
            extra={
              bloqueadasAgora.length
                ? plural(bloqueadasAgora.length, "bloqueada", "bloqueadas")
                : undefined
            }
          >
            Casas bloqueadas de votar
          </TituloSecao>
          <Cartao className="flex flex-col gap-3">
            <p className="flex items-start gap-2.5 rounded-2xl bg-surface-2 p-3 text-[0.92rem] text-ink-2">
              <Lock aria-hidden className="mt-0.5 size-5 shrink-0 text-ink" />
              <span>
                Durante a votação não dá para bloquear nem desbloquear casas. A
                lista ficou congelada quando a votação abriu.
              </span>
            </p>
            {bloqueadasAgora.length ? (
              <ul aria-label="Casas bloqueadas" className="flex flex-wrap gap-2">
                {bloqueadasAgora.map((c) => (
                  <li
                    key={c.id}
                    className="afundado rounded-full px-3 py-1 text-[0.9rem] font-bold text-ink"
                  >
                    {c.rotulo}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[0.92rem] text-muted">
                Nenhuma casa bloqueada.
              </p>
            )}
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
