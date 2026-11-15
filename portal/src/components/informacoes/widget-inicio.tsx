/**
 * Bloco do Início do morador com as informações do condomínio:
 * atalho da votação oficial, PIX da taxa e ronda noturna (e, se pedido,
 * o responsável pelas reservas). Componente de SERVIDOR: lê os dados com a
 * permissão conferida. Se não houver nada cadastrado, não mostra nada.
 */
import type { Contexto } from "@/server/contexto";
import { informacoesDoCondominio, type InformacoesDoCondominio } from "@/server/dados/informacoes";
import { TituloSecao } from "@/components/ui/painel";
import { AtalhoVotacao, CartaoPix, CartaoResponsavelReservas, CartaoRonda } from "./cartoes";

export type PecaInformacao = "votacao" | "pix" | "ronda" | "responsavel";

export async function WidgetInformacoesInicio({
  ctx,
  mostrar = ["votacao", "pix", "ronda"],
  titulo = "Do condomínio",
}: {
  ctx: Contexto;
  /** Quais peças aparecem, nesta ordem. */
  mostrar?: PecaInformacao[];
  titulo?: string;
}) {
  // Perfil sem acesso às informações: o bloco simplesmente não aparece.
  if (!ctx.permissoes.has("informacoes.ver")) return null;

  let info: InformacoesDoCondominio;
  try {
    info = await informacoesDoCondominio(ctx);
  } catch (erro) {
    // Se a leitura falhar, o Início continua abrindo sem este bloco.
    console.error("Início: não foi possível carregar as informações do condomínio", erro);
    return null;
  }

  const pecas = mostrar.flatMap((p) => {
    if (p === "votacao" && info.linkVotacao) return [<AtalhoVotacao key="votacao" link={info.linkVotacao} />];
    if (p === "pix" && info.pix) return [<CartaoPix key="pix" pix={info.pix} />];
    if (p === "ronda" && info.telefoneRonda) return [<CartaoRonda key="ronda" telefone={info.telefoneRonda} />];
    if (p === "responsavel" && info.responsavelReservas) {
      return [<CartaoResponsavelReservas key="responsavel" responsavel={info.responsavelReservas} />];
    }
    return [];
  });
  if (!pecas.length) return null;

  return (
    <section aria-labelledby="titulo-info-inicio" className="flex flex-col gap-3">
      <TituloSecao id="titulo-info-inicio">{titulo}</TituloSecao>
      <div className="grid gap-3 sm:grid-cols-2">{pecas}</div>
    </section>
  );
}
