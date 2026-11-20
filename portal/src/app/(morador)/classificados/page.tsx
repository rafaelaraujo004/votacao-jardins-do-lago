import type { Metadata } from "next";
import Link from "next/link";
import { Ban, ChevronRight, Megaphone, Pencil, Plus, ShieldCheck, Store, UserRound } from "lucide-react";
import { exigirPermissao } from "@/server/contexto";
import { anunciosPublicados, meusAnuncios, type MeuAnuncio } from "@/server/dados/classificados";
import { removerMeuAnuncio } from "@/server/acoes/classificados";
import { formatarData } from "@/lib/formato";
import {
  CATEGORIAS_CLASSIFICADO,
  ROTULO_CATEGORIA,
  ehCategoria,
  formatarWhatsapp,
  podeEditar,
  podeRemover,
  primeiroNome,
} from "@/lib/classificados";
import { Alerta, Cartao, EstadoVazio, Etiqueta } from "@/components/ui/basicos";
import { BotaoLink } from "@/components/ui/botao";
import { AcaoConfirmada } from "@/components/ui/acao-confirmada";
import { CabecalhoPagina, SegmentoLinks, TituloSecao } from "@/components/ui/painel";
import { BotaoWhatsapp, CorpoAnuncio, EtiquetaSituacao } from "@/components/classificados/pecas";
import { FormularioAnuncio } from "@/components/classificados/formulario-anuncio";

export const metadata: Metadata = { title: "Classificados" };

type Aba = "lista" | "meus" | "novo";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

/**
 * Classificados (com login, permissão "classificados.usar").
 * - Lista: só anúncios aprovados e dentro do prazo, com o primeiro nome do autor e o
 *   WhatsApp que ele quis mostrar. NUNCA a casa.
 * - Meus anúncios: os da própria pessoa, com a situação e o motivo.
 * - Anunciar: formulário (o anúncio fica aguardando aprovação).
 */
export default async function Classificados({ searchParams }: Props) {
  const ctx = await exigirPermissao("classificados.usar", "/classificados");
  const params = await searchParams;
  const aba: Aba = params.aba === "meus" || params.aba === "novo" ? params.aba : "lista";
  const categoria = ehCategoria(params.categoria) ? params.categoria : null;
  const agora = new Date();

  // "Meus anúncios" é lido sempre: o número aparece na aba.
  const [publicados, meus] = await Promise.all([
    aba === "lista" ? anunciosPublicados(ctx, agora) : Promise.resolve([]),
    meusAnuncios(ctx, agora),
  ]);
  const meusAtivos = meus.filter((a) => a.situacao === "pendente" || a.situacao === "aprovado").length;

  // Quem modera: o síndico vai para o painel; o morador com a permissão extra, para a tela dele.
  const linkModerar = ctx.permissoes.has("classificados.moderar")
    ? ctx.permissoes.has("area.gestao")
      ? "/admin/classificados"
      : "/classificados/moderar"
    : null;

  return (
    <div className="flex flex-col gap-5">
      <CabecalhoPagina
        sobretitulo="Comunidade"
        titulo="Classificados"
        subtitulo="Vendas, serviços e doações entre vizinhos. Todo anúncio passa pela administração antes de aparecer."
      />

      <SegmentoLinks
        rotulo="Seções dos classificados"
        rolavel
        ariaCurrent="page"
        opcoes={[
          { rotulo: "Anúncios", href: "/classificados", ativo: aba === "lista" },
          { rotulo: meusAtivos ? `Meus anúncios (${meusAtivos})` : "Meus anúncios", href: "/classificados?aba=meus", ativo: aba === "meus" },
          { rotulo: "Anunciar", href: "/classificados?aba=novo", ativo: aba === "novo" },
        ]}
      />

      {linkModerar ? (
        <Link
          href={linkModerar}
          className="saltado flex min-h-14 items-center gap-3 rounded-2xl px-4 py-2 font-bold text-ink transition-shadow active:shadow-afundado"
        >
          <ShieldCheck aria-hidden className="size-5 shrink-0 text-pine" />
          <span className="flex-1">Moderar anúncios</span>
          <ChevronRight aria-hidden className="size-5 shrink-0 text-pine" />
        </Link>
      ) : null}

      {aba === "novo" ? (
        ctx.unitId ? (
          <Cartao className="p-4 sm:p-5">
            <FormularioAnuncio primeiroNome={primeiroNome(ctx.nome)} />
          </Cartao>
        ) : (
          <Alerta tipo="aviso" titulo="Seu cadastro não está ligado a uma casa">
            Para anunciar, peça à administração para ligar seu cadastro à sua casa.
          </Alerta>
        )
      ) : aba === "meus" ? (
        <MeusAnuncios anuncios={meus} fuso={ctx.fuso} agora={agora} />
      ) : (
        <ListaPublica
          anuncios={categoria ? publicados.filter((a) => a.categoria === categoria) : publicados}
          total={publicados.length}
          categoria={categoria}
          fuso={ctx.fuso}
        />
      )}
    </div>
  );
}

function ListaPublica({
  anuncios,
  total,
  categoria,
  fuso,
}: {
  anuncios: Awaited<ReturnType<typeof anunciosPublicados>>;
  total: number;
  categoria: string | null;
  fuso: string;
}) {
  if (total === 0) {
    return (
      <EstadoVazio
        icone={Store}
        titulo="Nenhum anúncio no momento"
        acao={
          <BotaoLink href="/classificados?aba=novo" icone={<Plus aria-hidden className="size-5" />}>
            Anunciar
          </BotaoLink>
        }
      >
        Tem algo para vender, doar ou um serviço para oferecer? Anuncie para os vizinhos.
      </EstadoVazio>
    );
  }

  return (
    <section aria-labelledby="titulo-anuncios" className="flex flex-col gap-3">
      <SegmentoLinks
        rotulo="Filtrar por categoria"
        rolavel
        ariaCurrent="page"
        opcoes={[
          { rotulo: "Todos", href: "/classificados", ativo: !categoria },
          ...CATEGORIAS_CLASSIFICADO.map((c) => ({
            rotulo: ROTULO_CATEGORIA[c],
            href: `/classificados?categoria=${c}`,
            ativo: categoria === c,
          })),
        ]}
      />
      <TituloSecao id="titulo-anuncios" extra={anuncios.length === 1 ? "1 anúncio" : `${anuncios.length} anúncios`}>
        {categoria && ehCategoria(categoria) ? ROTULO_CATEGORIA[categoria] : "Todos os anúncios"}
      </TituloSecao>

      {anuncios.length === 0 ? (
        <EstadoVazio icone={Store} titulo="Nada nesta categoria">
          Escolha outra categoria ou veja todos os anúncios.
        </EstadoVazio>
      ) : (
        <ul className="grid gap-3 lg:grid-cols-2">
          {anuncios.map((a) => (
            <li key={a.id}>
              <Cartao className="h-full p-4">
                <CorpoAnuncio
                  titulo={a.titulo}
                  texto={a.texto}
                  categoria={a.categoria}
                  preco={a.preco}
                  fotos={a.fotos}
                  etiquetas={
                    a.meu ? (
                      <Etiqueta tom="destaque" icone={UserRound}>
                        Seu anúncio
                      </Etiqueta>
                    ) : null
                  }
                  rodape={
                    <>
                      <p className="text-[0.88rem] text-muted">
                        Anunciado por <b className="text-ink-2">{a.autorPrimeiroNome}</b>
                        {a.publicadoEm ? ` em ${formatarData(a.publicadoEm, fuso)}` : ""}
                      </p>
                      {a.contatoWhatsapp ? (
                        <div>
                          <BotaoWhatsapp numero={a.contatoWhatsapp} titulo={a.titulo} />
                        </div>
                      ) : (
                        <p className="text-[0.88rem] text-muted">O autor não informou um contato.</p>
                      )}
                    </>
                  }
                />
              </Cartao>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function MeusAnuncios({ anuncios, fuso, agora }: { anuncios: MeuAnuncio[]; fuso: string; agora: Date }) {
  if (anuncios.length === 0) {
    return (
      <EstadoVazio
        icone={Megaphone}
        titulo="Você ainda não anunciou"
        acao={
          <BotaoLink href="/classificados?aba=novo" icone={<Plus aria-hidden className="size-5" />}>
            Criar anúncio
          </BotaoLink>
        }
      >
        Seus anúncios aparecem aqui, com a situação de cada um.
      </EstadoVazio>
    );
  }

  return (
    <section aria-labelledby="titulo-meus" className="flex flex-col gap-3">
      <TituloSecao id="titulo-meus">Meus anúncios</TituloSecao>
      <ul className="flex flex-col gap-3">
        {anuncios.map((a) => (
          <li key={a.id}>
            <Cartao className="p-4">
              <CorpoAnuncio
                titulo={a.titulo}
                texto={a.texto}
                categoria={a.categoria}
                preco={a.preco}
                fotos={a.fotos}
                etiquetas={<EtiquetaSituacao situacao={a.situacao} />}
                rodape={
                  <>
                    <p className="text-[0.88rem] text-muted">
                      {a.criadoEm ? `Enviado em ${formatarData(a.criadoEm, fuso)}` : "Enviado"}
                      {a.situacao === "aprovado" && a.expiraEm ? ` · no ar até ${formatarData(a.expiraEm, fuso)}` : ""}
                      {a.situacao === "expirado" && a.expiraEm ? ` · saiu do ar em ${formatarData(a.expiraEm, fuso)}` : ""}
                      {a.contatoWhatsapp ? ` · WhatsApp ${formatarWhatsapp(a.contatoWhatsapp)}` : " · sem WhatsApp"}
                    </p>
                    {a.situacao === "pendente" ? (
                      <p className="text-[0.88rem] text-ink-2">A administração ainda vai olhar este anúncio.</p>
                    ) : null}
                    {(a.situacao === "rejeitado" || a.situacao === "removido") && a.motivo ? (
                      <p className="text-[0.9rem] text-ink-2">
                        <b>Motivo:</b> {a.motivo}
                      </p>
                    ) : null}
                    {a.situacao === "expirado" ? (
                      <p className="text-[0.88rem] text-ink-2">Quer anunciar de novo? Crie um anúncio novo em “Anunciar”.</p>
                    ) : null}
                    {podeEditar(a.situacao, a.expiraEm, agora) || podeRemover(a.situacao, a.expiraEm, agora) ? (
                      <div className="flex flex-wrap gap-2">
                        {podeEditar(a.situacao, a.expiraEm, agora) ? (
                          <Link
                            href={`/classificados/${a.id}/editar`}
                            className="saltado inline-flex min-h-11 items-center gap-1.5 rounded-full px-4 text-[0.9rem] font-bold text-pine active:shadow-afundado"
                          >
                            <Pencil aria-hidden className="size-4" /> {a.situacao === "rejeitado" ? "Corrigir e reenviar" : "Editar"}
                          </Link>
                        ) : null}
                        {podeRemover(a.situacao, a.expiraEm, agora) ? (
                        <AcaoConfirmada
                          acao={removerMeuAnuncio}
                          campos={{ id: a.id }}
                          titulo={a.situacao === "pendente" ? "Desistir deste anúncio?" : "Tirar este anúncio do ar?"}
                          mensagem={`“${a.titulo}” deixa de aparecer para os moradores. Não dá para desfazer, mas você pode criar outro anúncio depois.`}
                          textoConfirmar="Sim, remover"
                          perigo
                        >
                          <Ban aria-hidden className="size-4" /> Remover
                        </AcaoConfirmada>
                        ) : null}
                      </div>
                    ) : null}
                  </>
                }
              />
            </Cartao>
          </li>
        ))}
      </ul>
    </section>
  );
}
