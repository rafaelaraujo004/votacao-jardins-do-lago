/**
 * GET /api/financeiro/exportar?mes=AAAA-MM — planilha do mês (abre no Excel).
 * Gestão: qualquer mês. Morador: só meses publicados.
 */
import { NextResponse, type NextRequest } from "next/server";
import { getContexto } from "@/server/contexto";
import { lancamentosDoMes, mesesComSaldo, visaoFinanceira } from "@/server/dados/financeiro";
import { dataISOParaBR } from "@/lib/formato";
import { FORMAS_PAGAMENTO, nomeDoMesTitulo, REGEX_MES } from "@/lib/financeiro";

const numero = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const reais = (centavos: number) => numero.format(centavos / 100);

/** Célula de CSV segura: aspas escapadas e sem fórmulas (proteção contra "CSV injection"). */
function celula(valor: string): string {
  const seguro = /^[=+\-@\t\r]/.test(valor) ? `'${valor}` : valor;
  return `"${seguro.replace(/"/g, '""')}"`;
}

export async function GET(req: NextRequest) {
  const ctx = await getContexto();
  if (!ctx) return NextResponse.json({ erro: "Entre no portal para exportar." }, { status: 401 });
  if (ctx.precisaTrocarSenha) {
    return NextResponse.json({ erro: "Troque a sua senha provisória antes de continuar." }, { status: 403 });
  }

  let visao;
  try {
    visao = visaoFinanceira(ctx);
  } catch {
    return NextResponse.json({ erro: "Seu perfil não pode ver o financeiro." }, { status: 403 });
  }

  const mes = req.nextUrl.searchParams.get("mes") ?? "";
  if (!REGEX_MES.test(mes)) return NextResponse.json({ erro: "Mês inválido." }, { status: 400 });

  const meses = await mesesComSaldo(ctx);
  const resumo = meses.find((m) => m.mes === mes);
  if (visao === "publicada" && !resumo?.publicado) return NextResponse.json({ erro: "Mês não publicado." }, { status: 404 });
  const lancamentos = await lancamentosDoMes(ctx, mes);

  const linhas: string[][] = [
    [ctx.condominioNome],
    [`Prestação de contas — ${nomeDoMesTitulo(mes)}`, resumo?.publicado ? "Publicada" : "Em aberto (não publicada)"],
    [],
    ["Saldo anterior", reais(resumo?.saldoAnteriorCentavos ?? 0)],
    ["Receitas", reais(resumo?.receitasCentavos ?? 0)],
    ["Despesas", reais(resumo?.despesasCentavos ?? 0)],
    ["Resultado do mês", reais(resumo?.resultadoCentavos ?? 0)],
    ["Saldo final", reais(resumo?.saldoFinalCentavos ?? 0)],
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
