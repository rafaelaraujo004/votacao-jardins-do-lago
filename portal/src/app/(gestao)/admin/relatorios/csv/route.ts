/**
 * GET /admin/relatorios/csv?assunto=financeiro|reservas|portaria|solicitacoes&ano=AAAA
 * Planilha do relatório (abre no Excel: separador ";" e acentos certos).
 * Sempre exige login e a permissão "relatorios.ver"; o condomínio vem da sessão.
 * Só totais: nenhum nome, casa ou texto de morador sai daqui.
 * É só leitura (GET): não precisa da checagem de origem.
 */
import { NextResponse, type NextRequest } from "next/server";
import { ErroDeAcesso, garantirPermissao, getContexto } from "@/server/contexto";
import { carregarRelatorio } from "@/server/dados/relatorios";
import { hojeISO } from "@/lib/formato";
import { anoValido, csvFinanceiro, csvPortaria, csvReservas, csvSolicitacoes, ehAssunto } from "@/lib/relatorios";

export async function GET(req: NextRequest) {
  // Sem login (ou sem permissão), nada sai daqui — nem a mensagem de parâmetro inválido.
  let ctx;
  try {
    ctx = garantirPermissao(await getContexto(), "relatorios.ver");
  } catch (e) {
    if (e instanceof ErroDeAcesso) {
      return NextResponse.json({ erro: e.message }, { status: e.motivo === "sem-sessao" ? 401 : 403 });
    }
    throw e;
  }

  const assunto = req.nextUrl.searchParams.get("assunto");
  const anoBruto = req.nextUrl.searchParams.get("ano") ?? "";
  const anoAtual = Number(hojeISO(new Date(), ctx.fuso).slice(0, 4));
  const ano = anoValido(anoBruto, anoAtual);
  if (!ehAssunto(assunto) || String(ano) !== anoBruto) {
    return NextResponse.json({ erro: "Relatório ou ano inválido." }, { status: 400 });
  }

  const r = await carregarRelatorio(ctx, assunto, ano);
  let csv: string;
  switch (r.assunto) {
    case "financeiro":
      if (!r.dados) return NextResponse.json({ erro: "Seu perfil não pode ver o financeiro." }, { status: 403 });
      csv = csvFinanceiro(ctx.condominioNome, r.dados);
      break;
    case "reservas":
      csv = csvReservas(ctx.condominioNome, r.dados);
      break;
    case "portaria":
      csv = csvPortaria(ctx.condominioNome, r.dados);
      break;
    case "solicitacoes":
      csv = csvSolicitacoes(ctx.condominioNome, r.dados);
      break;
  }

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="relatorio-${assunto}-${ano}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
