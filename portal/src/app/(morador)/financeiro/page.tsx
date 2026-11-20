import type { Metadata } from "next";
import { FileDown, FileText, Wallet } from "lucide-react";
import { exigirPermissao } from "@/server/contexto";
import { lancamentosPublicados, mesesPublicados } from "@/server/dados/morador";
import { totaisPorCategoria } from "@/server/dados/financeiro";
import { formatarMoeda } from "@/lib/formato";
import { nomeDoMes, REGEX_MES } from "@/lib/financeiro";
import { Cartao, EstadoVazio } from "@/components/ui/basicos";
import { classesDoBotao } from "@/components/ui/botao";
import { CabecalhoPagina, SegmentoLinks, TituloSecao } from "@/components/ui/painel";
import { CartoesResumo, DestaqueSaldo, ListaLancamentos, SeletorMes, TabelaEvolucao } from "@/components/financeiro/pecas";
import { GraficoSaldo } from "@/components/financeiro/grafico-saldo";

export const metadata: Metadata = { title: "Prestação de contas" };

/**
 * Prestação de contas do morador (com login): só os meses publicados pela administração.
 * Cada lançamento mostra descrição, categoria, data, valor e forma — nunca quem lançou
 * nem casa/pessoa (veja server/dados/morador.ts).
 */
export default async function FinanceiroMorador({ searchParams }: PageProps<"/financeiro">) {
  const ctx = await exigirPermissao("financeiro.ver_publicado", "/financeiro");
  const { mes: bruto, periodo: periodoBruto } = await searchParams;
  const meses = await mesesPublicados(ctx);

  const cabecalho = (
    <CabecalhoPagina sobretitulo="Contas" titulo="Prestação de contas" subtitulo="Para onde vai o dinheiro do Residencial Jardins do Lago." />
  );

  if (meses.length === 0) {
    return (
      <div className="flex flex-col gap-5">
        {cabecalho}
        <EstadoVazio icone={Wallet} titulo="Nenhuma prestação de contas publicada ainda">
          Assim que a administração publicar o primeiro mês, ele aparece aqui.
        </EstadoVazio>
      </div>
    );
  }

  const ultimo = meses[meses.length - 1];
  const escolhido = typeof bruto === "string" && REGEX_MES.test(bruto) ? meses.find((m) => m.mes === bruto) : undefined;
  const atual = escolhido ?? ultimo;
  const indice = meses.indexOf(atual);
  const lancamentos = await lancamentosPublicados(ctx, atual.mes);
  const categorias = totaisPorCategoria(lancamentos.filter((l) => l.tipo === "despesa"));
  const totalCategorias = categorias.reduce((soma, c) => soma + Math.max(c.totalCentavos, 0), 0);

  // Período do gráfico: 6 (padrão) ou 12 meses. Os links mantêm o mês escolhido.
  const periodo = periodoBruto === "12" ? 12 : 6;
  const consultaPeriodo = periodo === 12 ? "periodo=12" : undefined;
  const linkPeriodo = (p: 6 | 12) => {
    const partes = [escolhido ? `mes=${atual.mes}` : "", p === 12 ? "periodo=12" : ""].filter(Boolean);
    return partes.length ? `/financeiro?${partes.join("&")}` : "/financeiro";
  };
  const pontos = meses.slice(-periodo).map((m) => ({ mes: m.mes, saldoCentavos: m.saldoFinalCentavos }));

  return (
    <div className="flex flex-col gap-5">
      {cabecalho}

      <Cartao className="flex flex-col gap-4 p-3 sm:p-4">
        <SeletorMes
          mes={atual.mes}
          caminho="/financeiro"
          consulta={consultaPeriodo}
          anterior={meses[indice - 1]?.mes ?? null}
          proximo={meses[indice + 1]?.mes ?? null}
        />
        <div className="flex flex-wrap justify-center gap-2">
          <a href={`/relatorio/financeiro?mes=${atual.mes}`} target="_blank" rel="noopener" className={classesDoBotao("secundario", "pequeno")}>
            <FileText aria-hidden className="size-4" /> Baixar em PDF
          </a>
          <a href={`/api/financeiro/exportar?mes=${atual.mes}`} className={classesDoBotao("secundario", "pequeno")}>
            <FileDown aria-hidden className="size-4" /> Planilha (Excel)
          </a>
        </div>
      </Cartao>

      <DestaqueSaldo
        mes={atual.mes}
        saldoAnterior={atual.saldoAnteriorCentavos}
        receitas={atual.receitasCentavos}
        despesas={atual.despesasCentavos}
        saldoFinal={atual.saldoFinalCentavos}
      />

      <CartoesResumo
        saldo={atual.saldoFinalCentavos}
        receitas={atual.receitasCentavos}
        despesas={atual.despesasCentavos}
        rotuloSaldo={`no fim de ${nomeDoMes(atual.mes).split(" ")[0]}`}
        lancamentos={lancamentos.length}
        categorias={categorias.length}
      />

      <section className="flex flex-col gap-3" aria-labelledby="titulo-grafico">
        <div className="flex flex-wrap items-center justify-between gap-2.5">
          <TituloSecao id="titulo-grafico">Saldo nos últimos {periodo} meses</TituloSecao>
          <SegmentoLinks
            rotulo="Período do gráfico de saldo"
            opcoes={[
              { rotulo: "6 meses", href: linkPeriodo(6), ativo: periodo === 6 },
              { rotulo: "12 meses", href: linkPeriodo(12), ativo: periodo === 12 },
            ]}
          />
        </div>
        <GraficoSaldo pontos={pontos} />
      </section>

      {categorias.length ? (
        <section className="flex flex-col gap-3" aria-labelledby="titulo-categorias">
          <TituloSecao id="titulo-categorias" extra={`despesas de ${nomeDoMes(atual.mes).split(" ")[0]}`}>
            Para onde foi o dinheiro
          </TituloSecao>
          <Cartao>
            <ul className="flex flex-col gap-4">
              {categorias.map((c) => {
                // Parte de cada categoria no total das despesas do mês.
                const parte = totalCategorias > 0 ? Math.max(c.totalCentavos, 0) / totalCategorias : 0;
                const porcento = Math.round(parte * 100);
                return (
                  <li key={c.nome} className="flex flex-col gap-1.5">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="min-w-0 font-bold">{c.nome}</span>
                      <span className="shrink-0 tabular-nums">
                        <strong>{formatarMoeda(c.totalCentavos)}</strong>{" "}
                        <span className="text-[0.88rem] text-muted">({porcento}%)</span>
                      </span>
                    </div>
                    <div aria-hidden className="afundado h-3 overflow-hidden rounded-full">
                      <div className="h-full rounded-full bg-plum" style={{ width: `${Math.max(parte * 100, 2)}%` }} />
                    </div>
                  </li>
                );
              })}
            </ul>
          </Cartao>
        </section>
      ) : null}

      <section className="flex flex-col gap-3" aria-labelledby="titulo-lanc">
        <TituloSecao id="titulo-lanc" extra={`${lancamentos.length} ${lancamentos.length === 1 ? "lançamento" : "lançamentos"}`}>
          Movimentações
        </TituloSecao>
        {lancamentos.length ? (
          <ListaLancamentos lancamentos={lancamentos} />
        ) : (
          <EstadoVazio icone={Wallet} titulo="Sem lançamentos neste mês" />
        )}
      </section>

      {meses.length > 1 ? (
        <section className="flex flex-col gap-3" aria-labelledby="titulo-evo">
          <TituloSecao id="titulo-evo">Meses anteriores</TituloSecao>
          <TabelaEvolucao meses={[...meses].reverse().slice(0, 12)} caminho="/financeiro" consulta={consultaPeriodo} />
        </section>
      ) : null}
    </div>
  );
}
