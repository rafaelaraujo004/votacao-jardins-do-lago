/**
 * GET /api/financeiro/exportar?mes=AAAA-MM — planilha do mês (abre no Excel).
 * Sempre exige login; o condomínio vem da sessão.
 * - Equipe com "financeiro.ver": qualquer mês do próprio condomínio.
 * - Morador ("financeiro.ver_publicado"): só meses PUBLICADOS, sem quem lançou
 *   e sem casas (mesmos filtros da tela).
 * É só leitura (GET): não precisa da checagem de origem.
 */
import { NextResponse, type NextRequest } from "next/server";
import { getContexto } from "@/server/contexto";
import { lancamentosDoMes, mesesComSaldo, type Lancamento } from "@/server/dados/financeiro";
import { lancamentosPublicados, mesesPublicados } from "@/server/dados/morador";
import type { MesComSaldo } from "@/lib/financeiro";
import { dataISOParaBR } from "@/lib/formato";
import { agruparPorCategoria, CAMPOS_QUADRO, FORMAS_PAGAMENTO, nomeDoMesTitulo, REGEX_MES } from "@/lib/financeiro";

const numero = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const reais = (centavos: number) => numero.format(centavos / 100);

/** Célula de CSV segura: aspas escapadas e sem fórmulas (proteção contra "CSV injection"). */
function celula(valor: string): string {
  const seguro = /^[=+\-@\t\r]/.test(valor) ? `'${valor}` : valor;
  return `"${seguro.replace(/"/g, '""')}"`;
}

export async function GET(req: NextRequest) {
  // Sem login, nada sai daqui (nem a mensagem de mês inválido).
  const ctx = await getContexto();
  if (!ctx) return NextResponse.json({ erro: "Entre no portal para baixar a planilha." }, { status: 401 });
  if (ctx.precisaTrocarSenha) {
    return NextResponse.json({ erro: "Troque a sua senha provisória antes de continuar." }, { status: 403 });
  }

  const mes = req.nextUrl.searchParams.get("mes") ?? "";
  if (!REGEX_MES.test(mes)) return NextResponse.json({ erro: "Mês inválido." }, { status: 400 });

  const nomeCondominio = ctx.condominioNome;
  let resumo: MesComSaldo | undefined;
  let lancamentos: Lancamento[];

  if (ctx.permissoes.has("financeiro.ver")) {
    // Equipe com acesso completo: qualquer mês do próprio condomínio.
    resumo = (await mesesComSaldo(ctx)).find((m) => m.mes === mes);
    lancamentos = await lancamentosDoMes(ctx, mes);
  } else if (ctx.permissoes.has("financeiro.ver_publicado")) {
    // Morador: só meses publicados.
    resumo = (await mesesPublicados(ctx)).find((m) => m.mes === mes);
    if (!resumo) return NextResponse.json({ erro: "Mês não publicado." }, { status: 404 });
    lancamentos = await lancamentosPublicados(ctx, mes);
  } else {
    return NextResponse.json({ erro: "Seu perfil não permite baixar a prestação de contas." }, { status: 403 });
  }

  // Subtotais como no relatório em papel (receitas, ordinárias, extraordinárias…) e o quadro de casas.
  const grupos = agruparPorCategoria(lancamentos);
  const totalDespesas = grupos.filter((g) => g.tipo === "despesa").reduce((t, g) => t + g.totalCentavos, 0);
  const casas = resumo?.casas ?? null;
  const linhasCasas: string[][] = casas
    ? [
        [],
        ["Quadro de casas"],
        ...CAMPOS_QUADRO.filter((c) => casas[c.chave] !== null).map((c) => [c.rotulo, String(casas[c.chave])]),
        ...(casas.observacao ? [["Observação", casas.observacao]] : []),
      ]
    : [];

  const linhas: string[][] = [
    [nomeCondominio],
    [`Prestação de contas — ${nomeDoMesTitulo(mes)}`, resumo?.publicado ? "Publicada" : "Em aberto (não publicada)"],
    [],
    ["Saldo anterior", reais(resumo?.saldoAnteriorCentavos ?? 0)],
    ["Receitas", reais(resumo?.receitasCentavos ?? 0)],
    ["Despesas", reais(resumo?.despesasCentavos ?? 0)],
    ["Resultado do mês", reais(resumo?.resultadoCentavos ?? 0)],
    ["Saldo final", reais(resumo?.saldoFinalCentavos ?? 0)],
    [],
    ["Subtotal por categoria"],
    ...grupos.map((g) => [`${g.nome} (${g.tipo === "receita" ? "receita" : "despesa"})`, reais(g.totalCentavos)]),
    ["Total geral das despesas", reais(totalDespesas)],
    ...linhasCasas,
    [],
    ["Data", "Tipo", "Categoria", "Descrição", "Forma de pagamento", "Valor (R$)", "Observação"],
    ...[...lancamentos].reverse().map((l) => [
      dataISOParaBR(l.data),
      l.tipo === "receita" ? "Receita" : "Despesa",
      l.categoriaNome,
      l.descricao,
      FORMAS_PAGAMENTO[l.forma] ?? l.forma,
      reais(l.valorCentavos),
      l.estornaId ? "Estorno" : l.estornadoPor ? "Estornado" : "",
    ]),
  ];

  // BOM + ";" : o Excel em português abre com acentos e colunas certas.
  const csv = "﻿" + linhas.map((l) => l.map(celula).join(";")).join("\r\n");
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="prestacao-de-contas-${mes}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
