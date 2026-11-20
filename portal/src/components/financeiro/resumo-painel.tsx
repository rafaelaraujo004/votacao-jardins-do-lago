/**
 * Prestação de contas no PAINEL do síndico e do conselho: os valores do mês
 * (saldo, receitas, despesas e resultado) e, abaixo, o gráfico do saldo dos
 * últimos 12 meses. Recebe os meses já calculados no servidor.
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
import { GraficoSaldo } from "./grafico-saldo";

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

  const doMes = ateHoje.find((m) => m.mes === mes);
  // Saldo no fim do mês mostrado (sem lançamentos no mês: o saldo que vinha de antes).
  const anterior = ateHoje.filter((m) => m.mes <= mes).at(-1);
  const saldo = doMes?.saldoFinalCentavos ?? anterior?.saldoFinalCentavos ?? saldoInicialCentavos;
  const pontos = pontosDoSaldo(ateHoje, MESES_NO_GRAFICO);
  // O aviso só faz sentido quando o gráfico aparece (2 meses ou mais).
  const temNaoPublicado = visaoCompleta && pontos.length >= 2 && ateHoje.slice(-MESES_NO_GRAFICO).some((m) => !m.publicado);
  const nomeCurto = nomeDoMes(mes).split(" ")[0];

  return (
    <section aria-labelledby="titulo-financeiro-painel" className="flex flex-col gap-3">
      {cabecalho}

      <div className="flex flex-wrap items-center gap-2">
        <span className="font-bold text-ink">{nomeDoMesTitulo(mes)}</span>
        <SituacaoMes publicado={doMes?.publicado ?? false} />
        {mes === mesAtual ? <span className="text-[0.88rem] text-muted">mês atual</span> : null}
      </div>

      <CartoesResumo
        saldo={saldo}
        receitas={doMes?.receitasCentavos ?? 0}
        despesas={doMes?.despesasCentavos ?? 0}
        rotuloSaldo={mes === mesAtual ? "em caixa agora" : `no fim de ${nomeCurto}`}
      />

      <h3 className="sr-only">Saldo nos últimos meses</h3>
      <GraficoSaldo
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
