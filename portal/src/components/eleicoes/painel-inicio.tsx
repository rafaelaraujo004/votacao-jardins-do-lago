/**
 * PAINEL DA VOTAÇÃO OFICIAL no topo do Início — parte do SERVIDOR.
 *
 * Lê a eleição em destaque do condomínio (a aberta; senão a próxima agendada; senão uma
 * encerrada há até 7 dias) e entrega ao painel ao vivo (<PainelEleicaoVivo>), que se
 * atualiza sozinho. Aparece para TODOS: moradores (perfil "morador") e equipe ("gestao").
 * Sem votação para mostrar, não aparece nada. Se a leitura falhar, o Início abre sem ele.
 *
 * - Morador que vota: vem junto a situação da PRÓPRIA casa (votou / não liberada), nunca o voto.
 * - Link de detalhe: morador → /votacao/{id} (se puder votar); equipe → /admin/votacao/{id}
 *   só para quem gerencia a votação (os demais só acompanham os números).
 * SIGILO: só números do condomínio inteiro (veja PainelEleicao em src/lib/eleicoes.ts).
 *
 * Uso: <Suspense fallback={null}><PainelEleicaoInicio ctx={ctx} perfil="morador" /></Suspense>
 */
import type { Contexto } from "@/server/contexto";
import { painelEmDestaque, situacaoDaCasa } from "@/server/dados/eleicoes";
import { PainelEleicaoVivo, type SituacaoCasaPainel } from "./painel-destaque";

export async function PainelEleicaoInicio({ ctx, perfil }: { ctx: Contexto; perfil: "morador" | "gestao" }) {
  let destaque: Awaited<ReturnType<typeof painelEmDestaque>> = null;
  try {
    destaque = await painelEmDestaque(ctx.condominioId);
  } catch (erro) {
    // Se a votação falhar, o Início continua abrindo.
    console.error("Início: não foi possível carregar o painel da votação oficial", erro);
    return null;
  }
  if (!destaque) return null;
  const { painel, eleicao } = destaque;

  // A situação da casa só importa para quem vota e enquanto a votação não tem resultado.
  let casa: SituacaoCasaPainel | null = null;
  if (perfil === "morador" && ctx.permissoes.has("eleicoes.votar") && ctx.unitId && painel.fase !== "resultado") {
    try {
      casa = await situacaoDaCasa(ctx, eleicao);
    } catch (erro) {
      console.error("Início: não foi possível ler a situação da casa na votação", erro);
    }
  }

  const hrefDetalhe =
    perfil === "morador"
      ? ctx.permissoes.has("eleicoes.votar")
        ? `/votacao/${painel.id}`
        : null
      : ctx.permissoes.has("eleicoes.gerenciar")
        ? `/admin/votacao/${painel.id}`
        : null;

  return (
    <PainelEleicaoVivo
      inicial={painel}
      casaInicial={casa}
      hrefDetalhe={hrefDetalhe}
      perfil={perfil}
      // Hora do servidor em que o painel foi montado: o navegador desconta a diferença do relógio.
      agoraServidor={painel.geradoEm}
      fuso={ctx.fuso}
    />
  );
}
