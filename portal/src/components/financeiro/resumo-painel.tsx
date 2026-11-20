/**
 * Prestação de contas no PAINEL do síndico e do conselho (e no início do morador):
 * os valores do mês (saldo, receitas, despesas e resultado) e, abaixo, o gráfico
 * dos últimos 12 meses. Tocar num mês do gráfico troca os valores de cima para
 * aquele mês. Recebe os meses já calculados no servidor.
 *
 * - Visão completa ("financeiro.ver"): mostra o mês atual, mesmo ainda em aberto,
 *   e o gráfico inclui meses que os moradores ainda não veem (avisado embaixo).
 * - Visão publicada: mostra o último mês publicado.
 */
import Link from "next/link";
import { ChevronRight, Wallet } from "lucide-react";
import { nomeDoMes, nomeDoMesTitulo, pontosDoSaldo, type MesComSaldo } from "@/lib/financeiro";
import { EstadoVazio } from "@/components/ui/basicos";
import { TituloSecao } from "@/components/ui/painel";
import { CartoesResumo, SituacaoMes } from "./pecas";
import { ResumoDosMeses, type PainelDoMes } from "./resumo-meses";

/** Quantos meses o gráfico do painel mostra. */
const MESES_NO_GRAFICO = 12;

export function ResumoFinanceiroPainel({
  meses,
  mesAtual,
  saldoInicialCentavos,
  visaoCompleta,
  href,
}: {
  /** Meses com saldo (já filtrados pela visão de quem está vendo). */
  meses: MesComSaldo[];
  /** "AAAA-MM" de hoje, no fuso do condomínio. */
  mesAtual: string;
  saldoInicialCentavos: number;
  visaoCompleta: boolean;
  /** Tela completa da prestação de contas (null = o perfil não pode abrir; sem link). */
  href: string | null;
}) {
  const ateHoje = meses.filter((m) => m.mes <= mesAtual);
  const mes = visaoCompleta ? mesAtual : ateHoje.at(-1)?.mes ?? null;

  const cabecalho = (
    <TituloSecao
      id="titulo-financeiro-painel"
      extra={
        href ? (
          <Link href={href} className="inline-flex min-h-11 items-center gap-1 font-bold text-lake underline-offset-2 hover:underline">
            Ver tudo <ChevronRight aria-hidden className="size-4" />
          </Link>
        ) : null
      }
    >
      Prestação de contas
    </TituloSecao>
  );

  if (!mes) {
    return (
      <section aria-labelledby="titulo-financeiro-painel" className="flex flex-col gap-3">
        {cabecalho}
        <EstadoVazio icone={Wallet} titulo="Nenhum mês publicado ainda">
          Assim que um mês for publicado, os valores e o gráfico aparecem aqui.
        </EstadoVazio>
      </section>
    );
  }

  const pontos = pontosDoSaldo(ateHoje, MESES_NO_GRAFICO);
  // O aviso só faz sentido quando o gráfico aparece (2 meses ou mais).
  const temNaoPublicado = visaoCompleta && pontos.length >= 2 && ateHoje.slice(-MESES_NO_GRAFICO).some((m) => !m.publicado);

  /** Cabeçalho e cartões de um mês (tocar no mês do gráfico mostra estes). */
  function painelDoMes(m: string): PainelDoMes {
    const doMes = ateHoje.find((x) => x.mes === m);
    // Saldo no fim do mês (sem lançamentos no mês: o saldo que vinha de antes).
    const anterior = ateHoje.filter((x) => x.mes <= m).at(-1);
    const saldo = doMes?.saldoFinalCentavos ?? anterior?.saldoFinalCentavos ?? saldoInicialCentavos;
    const nomeCurto = nomeDoMes(m).split(" ")[0];
    return {
      cabecalho: (
        <>
          <span className="font-bold text-ink">{nomeDoMesTitulo(m)}</span>
          <SituacaoMes publicado={doMes?.publicado ?? false} />
          {m === mesAtual ? <span className="text-[0.88rem] text-muted">mês atual</span> : null}
        </>
      ),
      cartoes: (
        <CartoesResumo
          saldo={saldo}
          receitas={doMes?.receitasCentavos ?? 0}
          despesas={doMes?.despesasCentavos ?? 0}
          rotuloSaldo={m === mesAtual ? "em caixa agora" : `no fim de ${nomeCurto}`}
        />
      ),
    };
  }

  // O mês que abre e cada mês do gráfico que tem lançamentos (o mês de partida não tem cartões).
  const paineis: Record<string, PainelDoMes> = { [mes]: painelDoMes(mes) };
  for (const p of pontos) {
    if (!paineis[p.mes] && ateHoje.some((x) => x.mes === p.mes)) paineis[p.mes] = painelDoMes(p.mes);
  }

  return (
    <section aria-labelledby="titulo-financeiro-painel" className="flex flex-col gap-3">
      {cabecalho}

      <ResumoDosMeses
        paineis={paineis}
        inicial={mes}
        pontos={pontos}
        mensagemVazia={
          visaoCompleta
            ? "O gráfico do saldo aparece a partir do segundo mês com lançamentos."
            : "O gráfico aparece quando houver pelo menos dois meses publicados."
        }
      />
      {temNaoPublicado ? (
        <p className="px-1 text-[0.86rem] text-muted">
          O gráfico inclui meses ainda não publicados: os moradores só veem os meses publicados.
        </p>
      ) : null}
    </section>
  );
}
