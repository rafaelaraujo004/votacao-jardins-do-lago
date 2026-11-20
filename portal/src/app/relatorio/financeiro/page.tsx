import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { exigirContexto } from "@/server/contexto";
import { lancamentosDoMes, listarCategorias, mesesComSaldo, type Lancamento } from "@/server/dados/financeiro";
import { lancamentosPublicados, mesesPublicados } from "@/server/dados/morador";
import { agruparPorCategoria, CAMPOS_QUADRO, FORMAS_PAGAMENTO, nomeDoMes, nomeDoMesTitulo, pontosDoSaldo, REGEX_MES, type MesComSaldo } from "@/lib/financeiro";
import { dataISOParaBR, formatarDataHora, formatarMoeda } from "@/lib/formato";
import { Logo } from "@/components/ui/marca";
import { BotaoImprimir } from "./botao-imprimir";
import { BarrasDeitadas, ColunasSaldo } from "./graficos";

export const metadata: Metadata = { title: "Relatório financeiro" };

/** Cores do papel (o relatório é sempre claro). Uma cor por gráfico. */
const VERDE = "#1d6b4e";
const VINHO = "#8b2a5c";
const MAIORES = 8;

/**
 * Relatório do mês pronto para imprimir ou "Salvar como PDF" pelo navegador — no mesmo formato do
 * relatório em papel do residencial (receitas, despesas ordinárias e extraordinárias com subtotal,
 * total geral, quadro de casas e saldo), com gráficos.
 * Sem bibliotecas extras: o próprio celular/computador gera o PDF.
 *
 * Sempre exige login (o condomínio vem da sessão). Quem vê o quê:
 * - Equipe com "financeiro.ver": qualquer mês, inclusive prévia.
 * - Morador ("financeiro.ver_publicado"): só meses PUBLICADOS, com os mesmos
 *   filtros de privacidade da tela (sem quem lançou, sem casas).
 * - Outros perfis: "sem acesso".
 */
export default async function RelatorioFinanceiro({ searchParams }: PageProps<"/relatorio/financeiro">) {
  const { mes: bruto } = await searchParams;
  const mes = typeof bruto === "string" && REGEX_MES.test(bruto) ? bruto : null;
  const ctx = await exigirContexto(mes ? `/relatorio/financeiro?mes=${mes}` : undefined);
  if (!mes) notFound();

  let meses: MesComSaldo[];
  let lancamentos: Lancamento[];

  const nomeCondominio = ctx.condominioNome;
  const fuso = ctx.fuso;
  if (ctx.permissoes.has("financeiro.ver")) {
    // Equipe com acesso completo: qualquer mês do próprio condomínio (inclusive prévia).
    [meses, lancamentos] = await Promise.all([mesesComSaldo(ctx), lancamentosDoMes(ctx, mes)]);
  } else if (ctx.permissoes.has("financeiro.ver_publicado")) {
    // Morador: só meses publicados.
    meses = await mesesPublicados(ctx);
    if (!meses.some((m) => m.mes === mes)) notFound();
    lancamentos = await lancamentosPublicados(ctx, mes);
  } else {
    redirect("/sem-acesso");
  }
  const resumo = meses.find((m) => m.mes === mes);
  const categorias = await listarCategorias(ctx);
  const grupos = agruparPorCategoria(lancamentos, new Map(categorias.map((c) => [c.id, c.ordem])));
  const receitas = grupos.filter((g) => g.tipo === "receita");
  const despesas = grupos.filter((g) => g.tipo === "despesa");
  const totalDespesas = despesas.reduce((t, g) => t + g.totalCentavos, 0);
  const totalReceitas = receitas.reduce((t, g) => t + g.totalCentavos, 0);
  const maiores = lancamentos
    .filter((l) => l.tipo === "despesa" && !l.estornaId && !l.estornadoPor)
    .sort((a, b) => b.valorCentavos - a.valorCentavos)
    .slice(0, MAIORES);
  const pontos = pontosDoSaldo(meses.filter((m) => m.mes <= mes), 12);
  const casas = resumo?.casas ?? null;
  const camposCasas = casas ? CAMPOS_QUADRO.filter((c) => casas[c.chave] !== null) : [];
  const nomeCurto = nomeDoMes(mes).split(" ")[0];

  const linha = "flex justify-between gap-4 border-b border-[#d0d6d2] py-1.5";
  const quebraNao = "break-inside-avoid";

  return (
    <main className="mx-auto max-w-3xl bg-white px-6 py-8 text-[#14211b] print:max-w-none print:px-0 print:py-0" style={{ colorScheme: "light" }}>
      <div className="mb-6 flex items-center justify-between gap-4 print:hidden">
        <p className="text-[0.95rem] text-[#3d4e45]">Use o botão para imprimir ou escolher “Salvar como PDF”.</p>
        <BotaoImprimir />
      </div>

      <header className="flex items-center gap-4 border-b-2 border-[#1d6b4e] pb-4">
        <Logo largura={110} className="shadow-none" />
        <div>
          <h1 className="text-2xl font-bold">Relatório financeiro — {nomeDoMesTitulo(mes)}</h1>
          <p className="text-[#3d4e45]">{nomeCondominio}</p>
          <p className="text-[0.85rem] text-[#5e6e65]">
            {resumo?.publicado ? "Prestação publicada" : "Prévia — mês ainda não publicado"} · gerado em {formatarDataHora(new Date(), fuso)}
          </p>
        </div>
      </header>

      {/* Resumo em números (o "rodapé" do relatório em papel, aqui em cima). */}
      <section className={`mt-6 grid grid-cols-2 gap-2 sm:grid-cols-4 ${quebraNao}`} aria-label="Resumo do mês">
        {[
          { rotulo: "Saldo do mês anterior", valor: resumo?.saldoAnteriorCentavos ?? 0 },
          { rotulo: "(+) Receitas", valor: resumo?.receitasCentavos ?? 0 },
          { rotulo: "(−) Despesas", valor: resumo?.despesasCentavos ?? 0 },
          { rotulo: "Saldo em conta", valor: resumo?.saldoFinalCentavos ?? 0, destaque: true },
        ].map((b) => (
          <div key={b.rotulo} className={`rounded-xl border px-3 py-2.5 ${b.destaque ? "border-[#1d6b4e] bg-[#e7f2ec]" : "border-[#d0d6d2]"}`}>
            <p className="text-[0.78rem] font-bold uppercase tracking-wide text-[#5e6e65]">{b.rotulo}</p>
            <p className="mt-0.5 text-[1.15rem] font-bold tabular-nums">{formatarMoeda(b.valor)}</p>
          </div>
        ))}
      </section>
      <p className="mt-2 text-[0.9rem] text-[#3d4e45]">
        Resultado de {nomeCurto}: <strong>{formatarMoeda(resumo?.resultadoCentavos ?? 0)}</strong>{" "}
        {(resumo?.resultadoCentavos ?? 0) >= 0 ? "(sobrou)" : "(faltou)"}.
      </p>

      {/* Gráficos */}
      {despesas.length ? (
        <section className={`mt-7 ${quebraNao}`}>
          <h2 className="mb-2 text-lg font-bold">Para onde foi o dinheiro</h2>
          <BarrasDeitadas
            titulo={`Despesas de ${nomeCurto} por categoria`}
            cor={VINHO}
            barras={despesas.map((g) => ({
              rotulo: g.nome,
              valorCentavos: g.totalCentavos,
              detalhe: totalDespesas > 0 ? `(${Math.round((Math.max(g.totalCentavos, 0) / totalDespesas) * 100)}%)` : undefined,
            }))}
          />
        </section>
      ) : null}

      {maiores.length >= 3 ? (
        <section className={`mt-7 ${quebraNao}`}>
          <h2 className="mb-2 text-lg font-bold">Maiores despesas do mês</h2>
          <BarrasDeitadas
            titulo={`As ${maiores.length} maiores despesas de ${nomeCurto}`}
            cor={VINHO}
            barras={maiores.map((l) => ({ rotulo: l.descricao, valorCentavos: l.valorCentavos }))}
          />
        </section>
      ) : null}

      {pontos.length >= 2 ? (
        <section className={`mt-7 ${quebraNao}`}>
          <h2 className="mb-2 text-lg font-bold">Saldo no fim de cada mês</h2>
          <ColunasSaldo pontos={pontos} cor={VERDE} />
        </section>
      ) : null}

      {/* Quadro de casas, como no relatório em papel. */}
      {casas ? (
        <section className={`mt-7 ${quebraNao}`}>
          <h2 className="mb-2 text-lg font-bold">Quadro de casas</h2>
          {camposCasas.length ? (
            <table className="w-full max-w-md border-collapse text-[0.95rem]">
              <tbody>
                {camposCasas.map((c) => (
                  <tr key={c.chave} className="border-b border-[#d0d6d2]">
                    <th scope="row" className="py-1.5 pr-4 text-left font-normal">{c.rotulo}</th>
                    <td className="py-1.5 text-right font-bold tabular-nums">{casas[c.chave]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : null}
          {casas.observacao ? <p className="mt-2 text-[0.9rem] text-[#3d4e45]">{casas.observacao}</p> : null}
        </section>
      ) : null}

      {/* Lançamentos separados como no relatório em papel: cada grupo com Nº e subtotal. */}
      <section className="mt-8">
        <h2 className="mb-2 text-lg font-bold">Lançamentos</h2>
        {grupos.length === 0 ? <p>Nenhum lançamento neste mês.</p> : null}
        {grupos.map((g) => (
          <div key={`${g.tipo}:${g.categoriaId}`} className="mb-6">
            <h3 className={`rounded-t-lg px-2 py-1.5 text-center text-[0.95rem] font-bold uppercase tracking-wide ${g.tipo === "receita" ? "bg-[#d7ebdf]" : "bg-[#f1dde7]"}`}>
              {g.nome}
            </h3>
            <table className="w-full border-collapse text-[0.9rem]">
              <thead>
                <tr className="border-b-2 border-[#14211b] text-left">
                  <th className="w-10 py-1.5 pr-2 text-center">Nº</th>
                  <th className="w-24 py-1.5 pr-2">Data</th>
                  <th className="py-1.5 pr-2">Descrição</th>
                  <th className="hidden py-1.5 pr-2 sm:table-cell print:table-cell">Forma</th>
                  <th className="py-1.5 text-right">Valor</th>
                </tr>
              </thead>
              <tbody>
                {g.itens.map((l, i) => (
                  <tr key={l.id} className="break-inside-avoid border-b border-[#d0d6d2] align-top">
                    <td className="py-1.5 pr-2 text-center tabular-nums">{i + 1}</td>
                    <td className="py-1.5 pr-2 whitespace-nowrap">{dataISOParaBR(l.data)}</td>
                    <td className="py-1.5 pr-2">
                      {l.descricao}
                      {l.estornadoPor ? " (estornado)" : ""}
                      {l.valorCentavos < 0 ? " (estorno)" : ""}
                    </td>
                    <td className="hidden py-1.5 pr-2 sm:table-cell print:table-cell">{l.forma === "outro" ? "—" : FORMAS_PAGAMENTO[l.forma] ?? l.forma}</td>
                    <td className="py-1.5 text-right whitespace-nowrap tabular-nums">{formatarMoeda(l.valorCentavos)}</td>
                  </tr>
                ))}
                <tr className="font-bold">
                  <td colSpan={3} className="py-2 pr-2 text-right sm:hidden print:hidden">Subtotal</td>
                  <td colSpan={4} className="hidden py-2 pr-2 text-right sm:table-cell print:table-cell">Subtotal</td>
                  <td className="py-2 text-right whitespace-nowrap tabular-nums">{formatarMoeda(g.totalCentavos)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        ))}
        {grupos.length ? (
          <div className={`grid gap-1 rounded-xl border-2 border-[#14211b] px-3 py-2 ${quebraNao}`}>
            {receitas.length ? <div className={linha}><span>Total das receitas</span><strong className="tabular-nums">{formatarMoeda(totalReceitas)}</strong></div> : null}
            {despesas.map((g) => (
              <div key={g.categoriaId} className={linha}><span>{g.nome}</span><span className="tabular-nums">{formatarMoeda(g.totalCentavos)}</span></div>
            ))}
            <div className="flex justify-between gap-4 py-1.5 text-[1.05rem]"><span className="font-bold">Total geral das despesas</span><strong className="tabular-nums">{formatarMoeda(totalDespesas)}</strong></div>
          </div>
        ) : null}
      </section>

      <footer className="mt-8 text-[0.8rem] text-[#5e6e65]">
        Documento gerado pelo Portal do Residencial Jardins do Lago. Valores em reais (R$). Lançamentos não são apagados: correções aparecem como estorno.
      </footer>
    </main>
  );
}
