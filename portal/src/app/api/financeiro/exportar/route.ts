/**
 * GET /api/financeiro/exportar?mes=AAAA-MM[&c=<id>] — planilha do mês (abre no Excel).
 * - Equipe logada com "financeiro.ver" (sem ?c=): qualquer mês do próprio condomínio.
 * - Link público (sem login): só meses PUBLICADOS do condomínio público, sem quem
 *   lançou e sem casas (mesmos filtros da tela).
 * É só leitura (GET): não precisa da checagem de origem.
 */
import { NextResponse, type NextRequest } from "next/server";
import { getContexto } from "@/server/contexto";
import { condominioPublico } from "@/server/publico";
import { lancamentosDoMes, mesesComSaldo, type Lancamento } from "@/server/dados/financeiro";
import { lancamentosPublicados, mesesPublicados } from "@/server/dados/publico";
import type { MesComSaldo } from "@/lib/financeiro";
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
  const mes = req.nextUrl.searchParams.get("mes") ?? "";
  if (!REGEX_MES.test(mes)) return NextResponse.json({ erro: "Mês inválido." }, { status: 400 });
  const c = req.nextUrl.searchParams.get("c") ?? undefined;

  let nomeCondominio: string;
  let resumo: MesComSaldo | undefined;
  let lancamentos: Lancamento[];

  // Sem ?c=, a equipe logada com acesso completo exporta o próprio condomínio (qualquer mês).
  const ctx = c === undefined ? await getContexto() : null;
  if (ctx && !ctx.precisaTrocarSenha && ctx.permissoes.has("financeiro.ver")) {
    nomeCondominio = ctx.condominioNome;
    resumo = (await mesesComSaldo(ctx)).find((m) => m.mes === mes);
    lancamentos = await lancamentosDoMes(ctx, mes);
  } else {
    const cp = await condominioPublico(c);
    if (!cp) return NextResponse.json({ erro: "Portal indisponível." }, { status: 404 });
    resumo = (await mesesPublicados(cp)).find((m) => m.mes === mes);
    if (!resumo) return NextResponse.json({ erro: "Mês não publicado." }, { status: 404 });
    nomeCondominio = cp.nome;
    lancamentos = await lancamentosPublicados(cp, mes);
  }

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
