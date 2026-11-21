import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { exigirPermissao } from "@/server/contexto";
import {
  casasParaBloqueio,
  obterEleicaoGestao,
  type CasaDaEleicao,
} from "@/server/dados/eleicoes";
import {
  ROTULO_DESEMPATE,
  contarNulos,
  porcentagemParticipacao,
  textoEscolhas,
  vagasTexto,
  type Apuracao,
} from "@/lib/eleicoes";
import { formatarDataHora } from "@/lib/formato";
import { idDocumento } from "@/lib/validacao";
import { VAGAS_ATA } from "@/lib/assinaturas-ata";
import {
  lerAssinaturasAta,
  type AssinaturaAta,
} from "@/server/dados/assinaturas-ata";
import { removerAssinaturaAta } from "@/server/acoes/assinaturas-ata";
import { enderecoBase } from "@/server/endereco";
import { Logo } from "@/components/ui/marca";
import { AcaoConfirmada } from "@/components/ui/acao-confirmada";
import { AcoesVagaAta } from "@/components/eleicoes/quadro-assinatura";
import { BotaoImprimir } from "../../financeiro/botao-imprimir";

export const metadata: Metadata = { title: "Ata da votação" };

/*
 * Cores do papel (a ata é sempre clara, como o relatório financeiro).
 * Os gráficos são SVG desenhados aqui no servidor: saem iguais no papel e no PDF
 * (o navegador imprime o preenchimento do SVG mesmo sem "gráficos de fundo") e não
 * precisam de JavaScript. O texto fica em HTML para não encolher no celular.
 * Nunca só a cor: cada parte tem nome e número escritos, e os nulos são listrados
 * (dá para distinguir até numa impressora preto e branco).
 */
const VERDE = "#1d6b4e";
const VERMELHO = "#a3392b";
const CINZA = "#7d8a83";
const CINZA_CLARO = "#e3e8e5";
const TRILHO = "#eef1ef";
const TINTA = "#14211b";
const quebraNao = "break-inside-avoid print:break-inside-avoid";

/** Porcentagens inteiras que somam 100 (maiores restos): os rótulos do gráfico fecham a conta. */
function porcentagensInteiras(valores: number[]): number[] {
  const total = valores.reduce((t, v) => t + v, 0);
  if (total <= 0) return valores.map(() => 0);
  const exatas = valores.map((v) => (v * 100) / total);
  const inteiras = exatas.map((x) => Math.floor(x));
  let falta = 100 - inteiras.reduce((t, v) => t + v, 0);
  const ordem = exatas
    .map((x, i) => ({ i, resto: x - Math.floor(x) }))
    .sort((a, b) => b.resto - a.resto);
  for (const { i } of ordem) {
    if (falta <= 0) break;
    inteiras[i] += 1;
    falta -= 1;
  }
  return inteiras;
}

const plural = (n: number, um: string, varios: string) =>
  `${n} ${n === 1 ? um : varios}`;

/** Listras dos nulos (mesmo desenho na barra, na rosca e na legenda). */
function PadraoNulos({ id }: { id: string }) {
  return (
    <defs>
      <pattern
        id={id}
        width="8"
        height="8"
        patternUnits="userSpaceOnUse"
        patternTransform="rotate(45)"
      >
        <rect width="8" height="8" fill={CINZA_CLARO} />
        <line x1="0" y1="0" x2="0" y2="8" stroke={CINZA} strokeWidth="4" />
      </pattern>
    </defs>
  );
}

type Parte = { rotulo: string; valor: number; cor: string; listrado?: boolean };

/** Quadradinho da legenda, com a mesma cor (ou listra) da parte do gráfico. */
function Amostra({ parte, id }: { parte: Parte; id: string }) {
  return (
    <svg aria-hidden viewBox="0 0 14 14" className="size-3.5 shrink-0">
      {parte.listrado ? <PadraoNulos id={id} /> : null}
      <rect
        width="14"
        height="14"
        rx="3"
        fill={parte.listrado ? `url(#${id})` : parte.cor}
        stroke={TINTA}
        strokeOpacity="0.25"
      />
    </svg>
  );
}

/**
 * Gráfico 1: barra empilhada com TODAS as casas aptas (Sim, Não e Sem votar).
 * As porcentagens aqui são das casas aptas (não dos votos válidos).
 */
function BarraCasasAptas({ partes }: { partes: Parte[] }) {
  const total = partes.reduce((t, p) => t + p.valor, 0);
  const pct = porcentagensInteiras(partes.map((p) => p.valor));
  const larguras = partes.map((p) => (total ? (p.valor * 100) / total : 0));
  const inicio = larguras.map((_, i) =>
    larguras.slice(0, i).reduce((t, v) => t + v, 0),
  );
  const descricao = partes
    .map((p, i) => `${p.rotulo}: ${p.valor} (${pct[i]}%)`)
    .join("; ");
  return (
    <figure className={quebraNao}>
      <figcaption className="mb-2 font-bold">
        1. Todas as casas aptas ({total}): Sim, Não e Sem votar
      </figcaption>
      <div className="relative">
        <svg
          role="img"
          aria-label={`Casas aptas. ${descricao}.`}
          viewBox="0 0 1000 40"
          preserveAspectRatio="none"
          className="block h-11 w-full"
        >
          <PadraoNulos id="nulos-barra" />
          <rect width="1000" height="40" fill={TRILHO} />
          {partes.map((p, i) =>
            larguras[i] > 0 ? (
              <rect
                key={p.rotulo}
                x={inicio[i] * 10}
                width={larguras[i] * 10}
                height="40"
                fill={p.listrado ? "url(#nulos-barra)" : p.cor}
                stroke="#ffffff"
                strokeWidth="2"
                vectorEffect="non-scaling-stroke"
              />
            ) : null,
          )}
        </svg>
        {/* Porcentagem escrita dentro de cada parte larga o bastante (as estreitas ficam só na legenda). */}
        <div aria-hidden className="absolute inset-0 flex">
          {partes.map((p, i) => (
            <span
              key={p.rotulo}
              style={{ width: `${larguras[i]}%` }}
              className="flex items-center justify-center overflow-hidden text-[0.85rem] font-bold"
            >
              {larguras[i] >= 10 ? (
                <span
                  className={
                    p.listrado
                      ? "rounded bg-white px-1 text-[#14211b]"
                      : "text-white"
                  }
                >
                  {pct[i]}%
                </span>
              ) : null}
            </span>
          ))}
        </div>
      </div>
      <ul className="mt-2 flex flex-col gap-1 text-[0.92rem] sm:flex-row sm:flex-wrap sm:gap-x-5">
        {partes.map((p, i) => (
          <li key={p.rotulo} className="flex items-center gap-2">
            <Amostra parte={p} id={`nulos-legenda-1-${i}`} />
            <span>
              <b>{p.rotulo}</b>: {plural(p.valor, "casa", "casas")} ({pct[i]}%)
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-1 text-[0.82rem] text-[#5e6e65]">
        Porcentagens sobre o total de casas aptas.
      </p>
    </figure>
  );
}

/** Gráfico 2: rosca da participação (votaram × não votaram). */
function RoscaParticipacao({
  numero,
  votaram,
  aptas,
}: {
  numero: number;
  votaram: number;
  aptas: number;
}) {
  const naoVotaram = Math.max(0, aptas - votaram);
  const p = porcentagemParticipacao(votaram, aptas);
  const raio = 46;
  const volta = 2 * Math.PI * raio;
  const fracao = aptas > 0 ? Math.min(1, Math.max(0, votaram / aptas)) : 0;
  const partes: Parte[] = [
    { rotulo: "Votaram", valor: votaram, cor: VERDE },
    {
      rotulo: "Sem votar",
      valor: naoVotaram,
      cor: CINZA,
      listrado: true,
    },
  ];
  return (
    <figure className={quebraNao}>
      <figcaption className="mb-2 font-bold">
        {numero}. Participação: casas que votaram
      </figcaption>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <svg
          role="img"
          aria-label={`Participação: ${p}%. ${votaram} de ${aptas} casas votaram; ${naoVotaram} não votaram.`}
          viewBox="0 0 120 120"
          className="size-36 shrink-0"
        >
          <PadraoNulos id="nulos-rosca" />
          <circle
            cx="60"
            cy="60"
            r={raio}
            fill="none"
            stroke="url(#nulos-rosca)"
            strokeWidth="18"
          />
          {fracao > 0 ? (
            <circle
              cx="60"
              cy="60"
              r={raio}
              fill="none"
              stroke={VERDE}
              strokeWidth="18"
              strokeDasharray={`${fracao * volta} ${volta}`}
              transform="rotate(-90 60 60)"
            />
          ) : null}
          <text
            x="60"
            y="62"
            textAnchor="middle"
            fontSize="24"
            fontWeight="700"
            fill={TINTA}
          >
            {p}%
          </text>
          <text x="60" y="80" textAnchor="middle" fontSize="11" fill="#3d4e45">
            votaram
          </text>
        </svg>
        <ul className="flex min-w-0 flex-col gap-1.5 text-[0.95rem]">
          {partes.map((parte, i) => (
            <li key={parte.rotulo} className="flex items-center gap-2">
              <Amostra parte={parte} id={`nulos-legenda-2-${i}`} />
              <span>
                <b>{parte.rotulo}</b>: {plural(parte.valor, "casa", "casas")}
              </span>
            </li>
          ))}
          <li className="text-[0.85rem] text-[#5e6e65]">
            De {plural(aptas, "casa apta", "casas aptas")}.
          </li>
        </ul>
      </div>
    </figure>
  );
}

/**
 * Gráfico 3 (chapa): Sim × Não dos votos VÁLIDOS, com a linha da "metade mais 1".
 * A chapa é eleita quando a barra do Sim passa da linha.
 */
function SimNaoComLinha({
  sim,
  nao,
  minimo,
  porcentagemSim,
}: {
  sim: number;
  nao: number;
  minimo: number;
  porcentagemSim: number;
}) {
  const validos = sim + nao;
  const porcentagemNao = validos ? 100 - porcentagemSim : 0;
  if (!validos) {
    return (
      <figure className={quebraNao}>
        <figcaption className="mb-2 font-bold">
          3. Sim × Não (votos válidos)
        </figcaption>
        <p className="text-[0.95rem]">
          Nenhum voto válido: a chapa não foi eleita.
        </p>
      </figure>
    );
  }
  const linha = (minimo / validos) * 100;
  const deslocar =
    linha < 25 ? "translateX(0)" : linha > 75 ? "translateX(-100%)" : "translateX(-50%)";
  return (
    <figure className={quebraNao}>
      <figcaption className="mb-2 font-bold">
        3. Sim × Não ({plural(validos, "voto válido", "votos válidos")})
      </figcaption>
      <div className="grid grid-cols-[2.5rem_1fr] gap-x-2">
        <div
          aria-hidden
          className="flex flex-col justify-around pt-6 text-[0.95rem] font-bold"
        >
          <span className="flex h-12 items-center">Sim</span>
          <span className="flex h-12 items-center">Não</span>
        </div>
        <div className="relative min-w-0 pt-6">
          <span
            aria-hidden
            className="absolute top-0 whitespace-nowrap text-[0.8rem] font-bold"
            style={{ left: `${linha}%`, transform: deslocar }}
          >
            Metade mais 1: {minimo}
          </span>
          <svg
            role="img"
            aria-label={`Sim: ${sim} votos (${porcentagemSim}%). Não: ${nao} votos (${porcentagemNao}%). Metade mais 1 dos votos válidos: ${minimo}.`}
            viewBox="0 0 1000 96"
            preserveAspectRatio="none"
            className="block h-24 w-full"
          >
            <rect y="8" width="1000" height="32" fill={TRILHO} />
            <rect y="8" width={(sim / validos) * 1000} height="32" fill={VERDE} />
            <rect y="56" width="1000" height="32" fill={TRILHO} />
            <rect
              y="56"
              width={(nao / validos) * 1000}
              height="32"
              fill={VERMELHO}
            />
            <line
              x1={linha * 10}
              x2={linha * 10}
              y1="0"
              y2="96"
              stroke={TINTA}
              strokeWidth="2"
              strokeDasharray="6 4"
              vectorEffect="non-scaling-stroke"
            />
          </svg>
        </div>
      </div>
      <ul className="mt-2 flex flex-col gap-1 text-[0.92rem] sm:flex-row sm:flex-wrap sm:gap-x-5">
        <li className="flex items-center gap-2">
          <Amostra parte={{ rotulo: "Sim", valor: sim, cor: VERDE }} id="sim-3" />
          <span>
            <b>Sim</b>: {plural(sim, "voto", "votos")} ({porcentagemSim}%)
          </span>
        </li>
        <li className="flex items-center gap-2">
          <Amostra
            parte={{ rotulo: "Não", valor: nao, cor: VERMELHO }}
            id="nao-3"
          />
          <span>
            <b>Não</b>: {plural(nao, "voto", "votos")} ({porcentagemNao}%)
          </span>
        </li>
        <li className="flex items-center gap-2">
          <svg aria-hidden viewBox="0 0 14 14" className="size-3.5 shrink-0">
            <line
              x1="7"
              x2="7"
              y1="0"
              y2="14"
              stroke={TINTA}
              strokeWidth="2"
              strokeDasharray="3 2"
            />
          </svg>
          <span>
            <b>Linha tracejada</b>: metade mais 1 ({minimo})
          </span>
        </li>
      </ul>
      <p className="mt-1 text-[0.82rem] text-[#5e6e65]">
        Porcentagens sobre os votos válidos (Sim + Não). As casas sem votar ficam fora
        desta conta.
      </p>
    </figure>
  );
}

/** Gráfico 3 (candidatos): votos de cada candidato; eleitos marcados por escrito. */
function BarrasCandidatos({ apuracao }: { apuracao: Apuracao }) {
  const eleitos = new Set(apuracao.eleitos);
  const max = Math.max(...apuracao.ranking.map((l) => l.votos), 1);
  return (
    <figure className={quebraNao}>
      <figcaption className="mb-2 font-bold">2. Votos por candidato</figcaption>
      <ul className="flex flex-col gap-2.5">
        {apuracao.ranking.map((l) => {
          const eleito = eleitos.has(l.candidato.id);
          return (
            <li key={l.candidato.id} className={quebraNao}>
              <p className="text-[0.9rem] font-semibold break-words">
                {l.candidato.numero} · {l.candidato.nome}
                {eleito ? " — ELEITO" : ""}
              </p>
              <div className="mt-1 flex items-center gap-3">
                <svg
                  aria-hidden
                  viewBox="0 0 1000 20"
                  preserveAspectRatio="none"
                  className="block h-4 min-w-0 flex-1"
                >
                  <rect width="1000" height="20" fill={TRILHO} />
                  <rect
                    width={l.votos ? Math.max((l.votos / max) * 1000, 12) : 0}
                    height="20"
                    fill={eleito ? VERDE : CINZA}
                  />
                </svg>
                <span className="shrink-0 text-right text-[0.9rem] font-bold tabular-nums whitespace-nowrap">
                  {plural(l.votos, "voto", "votos")}
                </span>
              </div>
            </li>
          );
        })}
      </ul>
    </figure>
  );
}

/** Uma lista do anexo: números das casas em quadradinhos, em ordem de número. */
function ListaAnexo({
  titulo,
  casas,
}: {
  titulo: string;
  casas: CasaDaEleicao[];
}) {
  return (
    <div className={`mt-5 ${quebraNao}`}>
      <h3 className="mb-2 font-bold">
        {titulo} ({casas.length})
      </h3>
      {casas.length ? (
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(2.75rem,1fr))] gap-1">
          {casas.map((c) => (
            <li
              key={c.id}
              className="rounded border border-[#c3cbc6] py-0.5 text-center text-[0.85rem] tabular-nums"
            >
              {c.numero !== null ? c.numero : c.rotulo}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[0.92rem] text-[#5e6e65]">Nenhuma.</p>
      )}
    </div>
  );
}

/**
 * Uma parte da ata já assinada digitalmente: a imagem da assinatura sobre a linha, o nome,
 * o papel e quando foi assinada. Sai igual no papel e no PDF (é uma imagem PNG).
 */
function BlocoAssinado({
  a,
  fuso,
  eleicaoId,
}: {
  a: AssinaturaAta;
  fuso: string;
  eleicaoId: string;
}) {
  return (
    <div className={`flex flex-col items-center text-center ${quebraNao}`}>
      {/* eslint-disable-next-line @next/next/no-img-element -- assinatura pequena em data URL */}
      <img
        src={a.imagem}
        alt={`Assinatura de ${a.nome}`}
        className="relative -mb-4 h-20 w-auto max-w-full object-contain"
      />
      <div className="w-full border-t border-[#14211b] pt-1.5 text-[0.9rem]">
        <p className="font-bold break-words">{a.nome}</p>
        <p>{a.papel}</p>
        <p className="text-[0.78rem] text-[#5e6e65]">
          Assinado digitalmente em{" "}
          {a.assinadoEm ? formatarDataHora(a.assinadoEm, fuso) : "—"}{" "}
          {a.via === "link" ? "pelo link" : "neste aparelho"}
        </p>
      </div>
      <div className="mt-2 print:hidden">
        <AcaoConfirmada
          acao={removerAssinaturaAta}
          campos={{ id: eleicaoId, vaga: a.vaga }}
          titulo="Remover esta assinatura?"
          mensagem={`A assinatura de ${a.nome} (${a.papel}) sai da ata e a linha volta a ficar em branco. Use só para corrigir um engano. Fica registrado no histórico.`}
          textoConfirmar="Remover assinatura"
          perigo
        >
          Remover
        </AcaoConfirmada>
      </div>
    </div>
  );
}

const porNumero = (a: CasaDaEleicao, b: CasaDaEleicao) =>
  (a.numero ?? Infinity) - (b.numero ?? Infinity) ||
  a.rotulo.localeCompare(b.rotulo, "pt-BR", { numeric: true });

/**
 * ATA (relatório final) da votação oficial, pronta para imprimir ou "Salvar como PDF".
 * Só para a comissão (eleicoes.gerenciar) e só depois da apuração.
 * Traz totais, eleitos, linha do tempo e gráficos — nunca o voto de uma casa.
 *
 * Decisões de 21/11/2026: votos NULOS = casas aptas que não votaram; aparecem na ata
 * mas não entram na conta da metade mais 1 (que é dos votos válidos: Sim + Não).
 *
 * ANEXO (só com ?anexo=1): números das casas que votaram, que não votaram e as
 * bloqueadas. Fica desligado por padrão para a ata poder circular sem dados das casas.
 *
 * ASSINATURAS DIGITAIS (pedido de 21/11/2026, como no berçário Pingo de Gente): cada parte
 * (2 da comissão, síndico(a), testemunha) assina com o dedo neste aparelho ou por um link
 * mandado no WhatsApp (vale uma vez). Na impressão, a assinatura sai como imagem; a parte
 * ainda sem assinatura fica com a linha em branco para assinar à mão.
 * Veja src/server/dados/assinaturas-ata.ts.
 */
export default async function AtaVotacao({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ id }, busca] = await Promise.all([params, searchParams]);
  const anexo = busca.anexo === "1";
  const valido = idDocumento.safeParse(id).success;
  const ctx = await exigirPermissao(
    "eleicoes.gerenciar",
    valido
      ? `/relatorio/votacao/${id}${anexo ? "?anexo=1" : ""}`
      : undefined,
  );
  if (!valido) notFound();
  const e = await obterEleicaoGestao(ctx, id);
  if (!e || !e.apuracao) notFound();
  const resultado = e.apuracao;
  const chapa = resultado.modo === "chapa" ? resultado : null;
  const a: Apuracao | null = resultado.modo === "candidatos" ? resultado : null;
  const eleitos = new Set(a?.eleitos ?? []);
  const nomeDe = (cid: string) =>
    a?.ranking.find((l) => l.candidato.id === cid)?.candidato.nome ?? "";
  const linha = "flex justify-between gap-4 border-b border-[#d0d6d2] py-1.5";

  // "Sem votar" (no código, nulos): casas aptas que não votaram (mesma conta da tela da comissão).
  const nulos = contarNulos(e.casasAptas, e.votaram);
  const participacaoPct = porcentagemParticipacao(e.votaram, e.casasAptas);
  const validos = chapa ? chapa.sim + chapa.nao : 0;
  const bloqueadas = e.casasBloqueadas.length;

  const marcos = [
    e.publicadaEm ? { rotulo: "Publicada", data: e.publicadaEm } : null,
    { rotulo: "Abriu para votar", data: e.abreEm },
    { rotulo: "Encerrou", data: e.fechaEm },
    e.resultadoDivulgadoEm
      ? { rotulo: "Resultado divulgado a todos", data: e.resultadoDivulgadoEm }
      : null,
  ].filter((m): m is { rotulo: string; data: Date } => m !== null);

  // Anexo: só lê as casas quando foi pedido. Inativas ficam de fora.
  const casasAnexo = anexo
    ? (await casasParaBloqueio(ctx, e.id))
        .filter((c) => c.ativa)
        .sort(porNumero)
    : [];
  const anexoVotaram = casasAnexo.filter((c) => c.votou);
  const anexoBloqueadas = casasAnexo.filter((c) => c.bloqueada && !c.votou);
  const anexoNulos = casasAnexo.filter((c) => !c.bloqueada && !c.votou);
  const anexoDiferente =
    anexo &&
    (anexoVotaram.length !== e.votaram ||
      anexoNulos.length !== nulos ||
      anexoBloqueadas.length !== bloqueadas);

  const endereco = `/relatorio/votacao/${e.id}`;

  // Assinaturas digitais (e links para assinar que ainda estão valendo).
  const [assinaturasAta, base] = await Promise.all([
    lerAssinaturasAta(ctx, e.id),
    enderecoBase(),
  ]);
  const totalAssinadas = VAGAS_ATA.filter(
    (v) => assinaturasAta.assinaturas[v.id],
  ).length;

  return (
    <main
      className="mx-auto max-w-3xl bg-white px-6 py-8 text-[#14211b] print:max-w-none print:px-0 print:py-0"
      style={{ colorScheme: "light" }}
    >
      <div className="mb-6 flex flex-col gap-3 print:hidden">
        <Link
          href={`/admin/votacao/${e.id}`}
          className="flex min-h-11 w-fit items-center gap-1.5 font-bold text-[#1d6b4e]"
        >
          <ArrowLeft aria-hidden className="size-4" /> Voltar para a votação
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-[0.95rem] text-[#3d4e45]">
            Use o botão para imprimir ou escolher “Salvar como PDF”.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={anexo ? endereco : `${endereco}?anexo=1`}
              scroll={false}
              className="inline-flex min-h-11 items-center rounded-full border border-[#c3cbc6] px-4 text-[0.95rem] font-bold text-[#1d6b4e]"
            >
              {anexo ? "Tirar o anexo" : "Incluir anexo com as casas"}
            </Link>
            <BotaoImprimir />
          </div>
        </div>
      </div>

      <header className="flex items-center gap-4 border-b-2 border-[#1d6b4e] pb-4">
        <Logo largura={110} className="shadow-none" />
        <div>
          <h1 className="text-2xl font-bold">Ata da votação — {e.titulo}</h1>
          <p className="text-[#3d4e45]">{ctx.condominioNome}</p>
          <p className="text-[0.85rem] text-[#5e6e65]">
            Relatório final · gerado em {formatarDataHora(new Date(), ctx.fuso)}
          </p>
        </div>
      </header>

      <section className="mt-6 grid gap-1">
        <h2 className="mb-1 text-lg font-bold print:break-after-avoid">Dados da votação</h2>
        <div className={linha}>
          <span>Cargo</span>
          <strong>{e.cargo}</strong>
        </div>
        {chapa ? (
          <div className={linha}>
            <span>Cédula</span>
            <strong>Sim ou Não para a chapa</strong>
          </div>
        ) : (
          <>
            <div className={linha}>
              <span>Vagas</span>
              <strong>{vagasTexto(e.vagas)}</strong>
            </div>
            <div className={linha}>
              <span>Cédula</span>
              <strong>{textoEscolhas(e.escolhasPorCasa)} por casa</strong>
            </div>
          </>
        )}
        <div className={linha}>
          <span>Período</span>
          <strong className="text-right">
            {formatarDataHora(e.abreEm, ctx.fuso)} a{" "}
            {formatarDataHora(e.fechaEm, ctx.fuso)}
          </strong>
        </div>
        <div className={linha}>
          <span>Casas aptas a votar</span>
          <strong>{e.casasAptas}</strong>
        </div>
        <div className={linha}>
          <span>Casas bloqueadas pela comissão (não eram aptas)</span>
          <strong>{bloqueadas}</strong>
        </div>
        <div className={linha}>
          <span>Casas que votaram</span>
          <strong>{e.votaram}</strong>
        </div>
        <div className={linha}>
          <span>Participação</span>
          <strong>{participacaoPct}% das casas aptas</strong>
        </div>
        {chapa ? (
          <>
            <div className={linha}>
              <span>Votos válidos (Sim + Não)</span>
              <strong>{validos}</strong>
            </div>
            <div className={linha}>
              <span>Mínimo para eleger (metade mais 1 dos válidos)</span>
              <strong>{plural(chapa.minimo, "voto Sim", "votos Sim")}</strong>
            </div>
          </>
        ) : null}
        <div className={linha}>
          <span>Sem votar (casas aptas que não votaram)</span>
          <strong>{nulos}</strong>
        </div>
        {a ? (
          <>
            <div className={linha}>
              <span>Votos em branco</span>
              <strong>{a.brancos}</strong>
            </div>
            <div className={linha}>
              <span>Desempate</span>
              <strong className="text-right">
                {ROTULO_DESEMPATE[e.regraDesempate]}
              </strong>
            </div>
          </>
        ) : (
          <div className={linha}>
            <span>Regra</span>
            <strong className="text-right">
              Eleita com metade mais 1 dos votos válidos (Sim + Não)
            </strong>
          </div>
        )}
      </section>

      <section className={`mt-6 ${quebraNao}`}>
        <h2 className="mb-2 text-lg font-bold print:break-after-avoid">Linha do tempo</h2>
        <ol className="ml-2 border-l-2 border-[#c3cbc6] pl-5">
          {marcos.map((m) => (
            <li key={m.rotulo} className="relative pb-3 last:pb-0">
              <span
                aria-hidden
                className="absolute -left-[27px] top-1.5 size-3 rounded-full border-2 border-[#1d6b4e] bg-white"
              />
              <p className="text-[0.85rem] text-[#5e6e65]">{m.rotulo}</p>
              <p className="font-bold">{formatarDataHora(m.data, ctx.fuso)}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="mt-6">
        <h2 className="mb-2 text-lg font-bold print:break-after-avoid">Resultado</h2>
        {chapa ? (
          <>
            <p className="mb-2 text-xl font-bold">
              {chapa.eleita ? "CHAPA ELEITA" : "CHAPA NÃO ELEITA"} — Sim:{" "}
              {chapa.sim} · Não: {chapa.nao} · Sem votar: {nulos} (mínimo para
              eleger: {chapa.minimo})
            </p>
            <table className="w-full border-collapse text-[0.95rem]">
              <thead>
                <tr className="border-b-2 border-[#14211b] text-left">
                  <th className="py-1.5 pr-2">Integrante</th>
                  <th className="py-1.5 pr-2">Cargo</th>
                  <th className="py-1.5 text-right">Casa</th>
                </tr>
              </thead>
              <tbody>
                {e.candidatos.map((c) => (
                  <tr key={c.id} className="border-b border-[#d0d6d2]">
                    <td className="py-1.5 pr-2">{c.nome}</td>
                    <td className="py-1.5 pr-2">{c.funcao}</td>
                    <td className="py-1.5 text-right">{c.casa}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        ) : a ? (
          <table className="w-full border-collapse text-[0.95rem]">
            <thead>
              <tr className="border-b-2 border-[#14211b] text-left">
                <th className="py-1.5 pr-2">Nº</th>
                <th className="py-1.5 pr-2">Candidato</th>
                <th className="py-1.5 pr-2 text-right">Votos</th>
                <th className="py-1.5 text-right">Situação</th>
              </tr>
            </thead>
            <tbody>
              {a.ranking.map((l) => (
                <tr key={l.candidato.id} className="border-b border-[#d0d6d2]">
                  <td className="py-1.5 pr-2">{l.candidato.numero}</td>
                  <td className="py-1.5 pr-2">
                    {l.candidato.nome}
                    {l.candidato.casa ? (
                      <span className="text-[#5e6e65]">
                        {" "}
                        · {l.candidato.casa}
                      </span>
                    ) : null}
                  </td>
                  <td className="py-1.5 pr-2 text-right">{l.votos}</td>
                  <td className="py-1.5 text-right font-bold">
                    {eleitos.has(l.candidato.id) ? "Eleito" : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
        {a?.empate ? (
          <p className="mt-3 text-[0.95rem]">
            <b>Empate na {a.empate.vaga}ª vaga</b> ({a.empate.votos} votos):{" "}
            {a.empate.ids.map(nomeDe).join(", ")}.{" "}
            {a.empate.decididos
              ? `Decidido pela idade: ${a.empate.decididos.map(nomeDe).join(", ")}.`
              : "A comissão decide e registra abaixo: ____________________________________________"}
          </p>
        ) : null}
      </section>

      <section className="mt-8 flex flex-col gap-7">
        <h2 className="-mb-3 text-lg font-bold print:break-after-avoid">Gráficos</h2>
        {chapa ? (
          <>
            <BarraCasasAptas
              partes={[
                { rotulo: "Sim", valor: chapa.sim, cor: VERDE },
                { rotulo: "Não", valor: chapa.nao, cor: VERMELHO },
                { rotulo: "Sem votar", valor: nulos, cor: CINZA, listrado: true },
              ]}
            />
            <RoscaParticipacao
              numero={2}
              votaram={e.votaram}
              aptas={e.casasAptas}
            />
            <SimNaoComLinha
              sim={chapa.sim}
              nao={chapa.nao}
              minimo={chapa.minimo}
              porcentagemSim={chapa.porcentagemSim}
            />
          </>
        ) : a ? (
          <>
            <RoscaParticipacao
              numero={1}
              votaram={e.votaram}
              aptas={e.casasAptas}
            />
            <BarrasCandidatos apuracao={a} />
          </>
        ) : null}
      </section>

      <div className="mt-8 flex flex-col gap-2 text-[0.9rem] text-[#3d4e45]">
        <p>
          Voto secreto: o portal registrou apenas quais casas votaram e a soma
          dos votos{chapa ? " (Sim e Não)" : " de cada candidato"}. Nenhuma
          cédula individual foi guardada.
        </p>
        <p>
          Sem votar: são as casas aptas que não votaram até o encerramento.
          Elas aparecem nesta ata, mas{" "}
          {chapa
            ? "não entram na conta da metade mais 1, que considera só os votos válidos (Sim + Não)."
            : "não mudam a contagem dos candidatos."}{" "}
          Casas bloqueadas pela comissão não eram aptas e não contam como “sem votar”.
        </p>
      </div>

      {/*
        Assinaturas: digitais (imagem sobre a linha) ou em branco para assinar à mão no papel.
        Os botões (assinar aqui, mandar link, remover) só aparecem na tela, nunca na impressão.
      */}
      <section aria-labelledby="titulo-assinaturas" className={`mt-12 ${quebraNao}`}>
        <h2 id="titulo-assinaturas" className="sr-only">
          Assinaturas
        </h2>
        <p
          className="mb-6 rounded-xl border border-[#c3cbc6] bg-[#f6f8f7] px-4 py-2.5 text-[0.95rem] text-[#3d4e45] print:hidden"
          role="status"
        >
          <b className="text-[#14211b]">
            {totalAssinadas} de {VAGAS_ATA.length} assinaturas
          </b>
          {totalAssinadas < VAGAS_ATA.length
            ? " — assine aqui neste aparelho ou mande o link pelo WhatsApp. Na impressão, as linhas em branco ficam para assinar à mão."
            : " — a ata está toda assinada."}
        </p>
        <div className="grid gap-10 sm:grid-cols-2 print:grid-cols-2">
          {VAGAS_ATA.map((v) => {
            const assinada = assinaturasAta.assinaturas[v.id];
            if (assinada)
              return (
                <BlocoAssinado
                  key={v.id}
                  a={assinada}
                  fuso={ctx.fuso}
                  eleicaoId={e.id}
                />
              );
            const link = assinaturasAta.links[v.id];
            return (
              <div key={v.id} className={`flex flex-col ${quebraNao}`}>
                {/* Espaço para a assinatura à mão no papel. */}
                <div aria-hidden className="h-16" />
                <div className="border-t border-[#14211b] pt-1.5 text-center text-[0.9rem]">
                  {v.papel}
                </div>
                <div className="mt-3 print:hidden">
                  <AcoesVagaAta
                    eleicaoId={e.id}
                    vaga={v.id}
                    papel={v.papel}
                    titulo={e.titulo}
                    linkAtual={
                      link ? `${base}/assinar-ata/${link.codigo}` : null
                    }
                    linkCriadoEm={
                      link?.criadoEm
                        ? formatarDataHora(link.criadoEm, ctx.fuso)
                        : null
                    }
                  />
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {anexo ? (
        <section className="mt-12 border-t-2 border-[#1d6b4e] pt-6 print:break-before-page">
          <h2 className="text-lg font-bold">Anexo — participação por casa</h2>
          <p className="mt-1 font-bold">
            O anexo mostra só SE a casa votou — nunca em quem.
          </p>
          <p className="mt-1 text-[0.9rem] text-[#3d4e45]">
            Números das casas em ordem. Casas inativas no cadastro ficam de
            fora.
          </p>
          <ListaAnexo titulo="Casas que votaram" casas={anexoVotaram} />
          <ListaAnexo
            titulo="Casas sem votar"
            casas={anexoNulos}
          />
          <ListaAnexo
            titulo="Casas bloqueadas pela comissão"
            casas={anexoBloqueadas}
          />
          {anexoDiferente ? (
            <p className="mt-4 text-[0.85rem] text-[#5e6e65]">
              O anexo usa o cadastro de casas de hoje. Se alguma casa mudou de
              situação depois da votação, as quantidades podem ser um pouco
              diferentes dos totais da ata.
            </p>
          ) : null}
        </section>
      ) : null}
    </main>
  );
}
