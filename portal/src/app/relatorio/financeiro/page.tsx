import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getContexto } from "@/server/contexto";
import { lancamentosDoMes, mesesComSaldo, totaisPorCategoria, visaoFinanceira } from "@/server/dados/financeiro";
import { dataISOParaBR, formatarDataHora, formatarMoeda } from "@/lib/formato";
import { FORMAS_PAGAMENTO, nomeDoMesTitulo, REGEX_MES } from "@/lib/financeiro";
import { Logo } from "@/components/ui/marca";
import { BotaoImprimir } from "./botao-imprimir";

export const metadata: Metadata = { title: "Relatório financeiro" };

/**
 * Relatório do mês pronto para imprimir ou "Salvar como PDF" pelo navegador.
 * Sem bibliotecas extras: o próprio celular/computador gera o PDF.
 */
export default async function RelatorioFinanceiro({ searchParams }: PageProps<"/relatorio/financeiro">) {
  const ctx = await getContexto();
  if (!ctx) redirect("/entrar");
  let visao;
  try {
    visao = visaoFinanceira(ctx);
  } catch {
    redirect("/sem-acesso");
  }

  const { mes: bruto } = await searchParams;
  const mes = typeof bruto === "string" && REGEX_MES.test(bruto) ? bruto : null;
  if (!mes) notFound();

  const meses = await mesesComSaldo(ctx);
  const resumo = meses.find((m) => m.mes === mes);
  if (visao === "publicada" && !resumo?.publicado) notFound();
  const lancamentos = await lancamentosDoMes(ctx, mes);
  const categorias = totaisPorCategoria(lancamentos);

  const linha = "flex justify-between gap-4 border-b border-[#d0d6d2] py-1.5";

  return (
    <main className="mx-auto max-w-3xl bg-white px-6 py-8 text-[#14211b] print:max-w-none print:px-0 print:py-0" style={{ colorScheme: "light" }}>
      <div className="mb-6 flex items-center justify-between gap-4 print:hidden">
        <p className="text-[0.95rem] text-[#3d4e45]">Use o botão para imprimir ou escolher “Salvar como PDF”.</p>
        <BotaoImprimir />
      </div>

      <header className="flex items-center gap-4 border-b-2 border-[#1d6b4e] pb-4">
        <Logo largura={110} className="shadow-none" />
        <div>
          <h1 className="text-2xl font-bold">Prestação de contas — {nomeDoMesTitulo(mes)}</h1>
          <p className="text-[#3d4e45]">{ctx.condominioNome}</p>
          <p className="text-[0.85rem] text-[#5e6e65]">
            {resumo?.publicado ? "Prestação publicada" : "Prévia — mês ainda não publicado"} · gerado em {formatarDataHora(new Date(), ctx.fuso)}
          </p>
        </div>
      </header>

      <section className="mt-6 grid gap-1">
        <h2 className="mb-1 text-lg font-bold">Resumo</h2>
        <div className={linha}><span>Saldo anterior</span><strong>{formatarMoeda(resumo?.saldoAnteriorCentavos ?? 0)}</strong></div>
        <div className={linha}><span>(+) Receitas</span><strong>{formatarMoeda(resumo?.receitasCentavos ?? 0)}</strong></div>
        <div className={linha}><span>(−) Despesas</span><strong>{formatarMoeda(resumo?.despesasCentavos ?? 0)}</strong></div>
        <div className={linha}><span>Resultado do mês</span><strong>{formatarMoeda(resumo?.resultadoCentavos ?? 0)}</strong></div>
        <div className="flex justify-between gap-4 py-2 text-lg"><span className="font-bold">Saldo final</span><strong>{formatarMoeda(resumo?.saldoFinalCentavos ?? 0)}</strong></div>
      </section>

      {categorias.length ? (
        <section className="mt-6">
          <h2 className="mb-1 text-lg font-bold">Por categoria</h2>
          {categorias.map((c) => (
            <div key={c.nome} className={linha}>
              <span>{c.nome} <span className="text-[#5e6e65]">({c.tipo === "receita" ? "receita" : "despesa"})</span></span>
              <strong>{formatarMoeda(c.totalCentavos)}</strong>
            </div>
          ))}
        </section>
      ) : null}

      <section className="mt-6">
        <h2 className="mb-2 text-lg font-bold">Lançamentos</h2>
        {lancamentos.length === 0 ? (
          <p>Nenhum lançamento neste mês.</p>
        ) : (
          <table className="w-full border-collapse text-[0.9rem]">
            <thead>
              <tr className="border-b-2 border-[#14211b] text-left">
                <th className="py-1.5 pr-2">Data</th>
                <th className="py-1.5 pr-2">Descrição</th>
                <th className="py-1.5 pr-2">Categoria</th>
                <th className="py-1.5 pr-2">Forma</th>
                <th className="py-1.5 text-right">Valor</th>
              </tr>
            </thead>
            <tbody>
              {[...lancamentos].reverse().map((l) => (
                <tr key={l.id} className="border-b border-[#d0d6d2] align-top">
                  <td className="py-1.5 pr-2 whitespace-nowrap">{dataISOParaBR(l.data)}</td>
                  <td className="py-1.5 pr-2">{l.descricao}{l.estornadoPor ? " (estornado)" : ""}</td>
                  <td className="py-1.5 pr-2">{l.categoriaNome}</td>
                  <td className="py-1.5 pr-2">{FORMAS_PAGAMENTO[l.forma] ?? l.forma}</td>
                  <td className="py-1.5 text-right whitespace-nowrap">
                    {l.tipo === "receita" ? "+" : "−"} {formatarMoeda(Math.abs(l.valorCentavos))}
                    {l.valorCentavos < 0 ? " (estorno)" : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <footer className="mt-8 text-[0.8rem] text-[#5e6e65]">
        Documento gerado pelo Portal Jardins do Lago. Valores em reais (R$). Lançamentos não são apagados: correções aparecem como estorno.
      </footer>
    </main>
  );
}
