import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  Ban,
  CircleCheck,
  Download,
  Images,
  Link2,
  RefreshCw,
} from "lucide-react";
import { exigirPermissao } from "@/server/contexto";
import { obterEleicaoGestao } from "@/server/dados/eleicoes";
import { listarEnvios, type LinhaEnvio } from "@/server/dados/votacao-links";
import {
  gerarLinksEleicao,
  trocarLinkCasa,
} from "@/server/acoes/votacao-links";
import { enderecoBase } from "@/server/endereco";
import { formatarTelefone, mensagemConvite } from "@/lib/contatos-votacao";
import {
  ALTURA_GUIA,
  IMAGENS_GUIA,
  LARGURA_GUIA,
  PDF_GUIA,
  textoGuiaGrupo,
} from "@/lib/guia-votacao";
import { formatarDataHora } from "@/lib/formato";
import { idDocumento } from "@/lib/validacao";
import {
  Alerta,
  Cartao,
  EstadoVazio,
  TituloPagina,
} from "@/components/ui/basicos";
import { AcaoConfirmada } from "@/components/ui/acao-confirmada";
import {
  BlocoNumero,
  SegmentoLinks,
  TituloSecao,
} from "@/components/ui/painel";
import { EnvioWhatsApp } from "@/components/eleicoes/envio-whatsapp";
import { EnviarImagensGuia } from "@/components/eleicoes/enviar-imagens-guia";
import { ImportarContatos } from "@/components/eleicoes/importar-contatos";

export const metadata: Metadata = { title: "Links de voto" };

const FILTROS = [
  { id: "faltam", rotulo: "Faltam votar" },
  { id: "nao-enviados", rotulo: "Não enviados" },
  { id: "sem-telefone", rotulo: "Sem telefone" },
  { id: "votaram", rotulo: "Já votaram" },
  { id: "todas", rotulo: "Todas" },
] as const;

/**
 * Comissão: importar os contatos (lista do Word), gerar um LINK DE VOTO por casa e enviar pelo
 * WhatsApp (1º e 2º contato). Mostra só QUEM votou, nunca o voto.
 * No alto, o passo a passo com imagens: dá para mandar no grupo do condomínio (as 9 imagens
 * ou o PDF único, para quando o WhatsApp não aceita tantas imagens), e cada casa também
 * recebe as imagens no passo 2 do envio (o link wa.me não anexa imagens).
 */
export default async function LinksDeVoto({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await exigirPermissao("eleicoes.gerenciar");
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  if (!idDocumento.safeParse(id).success) notFound();
  const e = await obterEleicaoGestao(ctx, id);
  if (!e) notFound();
  const [linhas, base] = await Promise.all([
    listarEnvios(ctx, id),
    enderecoBase(),
  ]);

  const ativas = linhas.filter((l) => l.ativa);
  const semLink = ativas.filter((l) => !l.codigo).length;
  const comTelefone = ativas.filter((l) => l.telefones.length).length;
  const enviados = ativas.filter((l) => l.enviadoEm).length;
  const filtro = FILTROS.find((f) => f.id === sp.ver) ?? FILTROS[0];
  const lista = ativas.filter((l) => {
    if (filtro.id === "faltam") return !l.votou && !l.bloqueada;
    if (filtro.id === "nao-enviados")
      return !l.enviadoEm && !l.votou && !l.bloqueada;
    if (filtro.id === "sem-telefone") return !l.telefones.length;
    if (filtro.id === "votaram") return l.votou;
    return true;
  });
  const periodo = `de ${formatarDataHora(e.abreEm, ctx.fuso)} até ${formatarDataHora(e.fechaEm, ctx.fuso)}`;
  const encerrada = e.situacao === "encerrada";
  // Texto do grupo: o mesmo para as imagens e para o PDF.
  const textoGrupo = textoGuiaGrupo({
    condominio: ctx.condominioNome,
    titulo: e.titulo,
    periodo,
  });

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <Link
        href={`/admin/votacao/${e.id}`}
        className="flex min-h-11 w-fit items-center gap-1.5 font-bold text-lake"
      >
        <ArrowLeft aria-hidden className="size-4" /> Voltar para a votação
      </Link>

      <TituloPagina
        sobretitulo="Votação oficial"
        titulo="Links de voto e WhatsApp"
        descricao="Cada casa tem um link próprio: abre a cédula sem precisar entrar no portal. Vale um voto por casa — quem abrir o link depois vê “voto já realizado”."
      />

      {e.status === "rascunho" ? (
        <Alerta tipo="aviso" titulo="A votação ainda é rascunho">
          Você já pode importar os contatos e gerar os links, mas só envie
          depois de publicar: antes disso o link mostra que a votação não está
          disponível.
        </Alerta>
      ) : null}

      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <BlocoNumero
          rotulo="Casas"
          valor={ativas.length}
          detalhe="ativas"
          cor="ink"
        />
        <BlocoNumero
          rotulo="Com telefone"
          valor={comTelefone}
          detalhe={`${ativas.length - comTelefone} sem`}
          cor="lake"
        />
        <BlocoNumero
          rotulo="Enviados"
          valor={enviados}
          detalhe="pelo WhatsApp"
          cor="laranja"
        />
        <BlocoNumero
          rotulo="Votaram"
          valor={e.votaram}
          detalhe={`de ${e.casasAptas} aptas`}
          cor="pine"
        />
      </div>

      <section aria-labelledby="titulo-guia" className="flex flex-col gap-3">
        <TituloSecao id="titulo-guia">Passo a passo com imagens</TituloSecao>
        <Cartao className="flex flex-col gap-3">
          <ul
            aria-label="Imagens do passo a passo"
            className="-mx-1 flex max-w-full snap-x gap-2 overflow-x-auto px-1 pb-2"
          >
            {IMAGENS_GUIA.map((img) => (
              <li key={img.src} className="w-20 shrink-0 snap-start sm:w-24">
                <Image
                  src={img.src}
                  alt={img.alt}
                  title={img.titulo}
                  width={LARGURA_GUIA}
                  height={ALTURA_GUIA}
                  sizes="96px"
                  loading="lazy"
                  className="h-auto w-full rounded-xl border border-line"
                />
              </li>
            ))}
          </ul>
          <p className="flex items-start gap-2 text-[0.9rem] text-ink-2">
            <Images aria-hidden className="mt-0.5 size-4 shrink-0 text-pine" />
            <span>
              Cada casa também recebe estas imagens no passo 2, logo depois da
              mensagem com o link. Se o WhatsApp não aceitar as{" "}
              {IMAGENS_GUIA.length} imagens, vai o PDF (1 arquivo,{" "}
              {PDF_GUIA.paginas} páginas).
            </span>
          </p>
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
            <EnviarImagensGuia
              variante="primario"
              rotulo="Mandar no grupo do condomínio"
              className="w-full sm:w-fit"
              texto={textoGrupo}
            />
            <EnviarImagensGuia
              formato="pdf"
              variante="secundario"
              rotulo="Mandar em PDF no grupo"
              className="w-full sm:w-fit"
              texto={textoGrupo}
            />
            <a
              href={PDF_GUIA.src}
              download={PDF_GUIA.arquivo}
              className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-full px-3 font-bold text-lake hover:shadow-afundado"
            >
              <Download aria-hidden className="size-4" /> Baixar o PDF
            </a>
          </div>
        </Cartao>
      </section>

      <section
        aria-labelledby="titulo-contatos"
        className="flex flex-col gap-3"
      >
        <TituloSecao id="titulo-contatos">
          1. Contatos dos moradores
        </TituloSecao>
        <Cartao>
          <ImportarContatos eleicaoId={e.id} />
        </Cartao>
      </section>

      <section aria-labelledby="titulo-gerar" className="flex flex-col gap-3">
        <TituloSecao id="titulo-gerar">2. Links das casas</TituloSecao>
        <Cartao className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-ink-2">
            {semLink === 0 ? (
              <span className="inline-flex items-center gap-1.5">
                <CircleCheck aria-hidden className="size-5 text-pine" /> Todas
                as casas ativas já têm link.
              </span>
            ) : (
              <>
                <b className="text-ink">{semLink}</b>{" "}
                {semLink === 1
                  ? "casa ainda não tem link."
                  : "casas ainda não têm link."}
              </>
            )}
          </p>
          {semLink > 0 && !encerrada ? (
            <AcaoConfirmada
              acao={gerarLinksEleicao}
              campos={{ id: e.id }}
              titulo="Gerar os links de voto?"
              mensagem={`Cada uma das ${semLink} casas recebe um link próprio e secreto. Os links que já existem não mudam.`}
              textoConfirmar="Sim, gerar"
              variante="primario"
            >
              <Link2 aria-hidden className="size-4" /> Gerar links
            </AcaoConfirmada>
          ) : null}
        </Cartao>
      </section>

      <section aria-labelledby="titulo-enviar" className="flex flex-col gap-3">
        <TituloSecao id="titulo-enviar" extra={`${lista.length}`}>
          3. Enviar pelo WhatsApp
        </TituloSecao>
        <p className="text-[0.9rem] text-muted">
          Em cada casa: toque em “1. Mensagem” e depois em “2. Imagens”. O
          WhatsApp abre uma conversa por vez: em casas com dois contatos, toque
          de novo em 1 para enviar ao 2º contato.
        </p>
        <SegmentoLinks
          rotulo="Filtrar casas"
          rolavel
          ariaCurrent="page"
          opcoes={FILTROS.map((f) => ({
            rotulo: f.rotulo,
            href: `/admin/votacao/${e.id}/links?ver=${f.id}`,
            ativo: f.id === filtro.id,
          }))}
        />
        {lista.length === 0 ? (
          <EstadoVazio icone={CircleCheck} titulo="Nenhuma casa neste filtro">
            Escolha outro filtro acima.
          </EstadoVazio>
        ) : (
          <ul className="flex flex-col gap-2.5">
            {lista.map((l) => (
              <li key={l.unitId}>
                <ItemEnvio
                  linha={l}
                  eleicaoId={e.id}
                  base={base}
                  titulo={e.titulo}
                  periodo={periodo}
                  encerrada={encerrada}
                  condominio={ctx.condominioNome}
                  modo={e.modo}
                />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function ItemEnvio({
  linha: l,
  eleicaoId,
  base,
  titulo,
  periodo,
  encerrada,
  condominio,
  modo,
}: {
  linha: LinhaEnvio;
  eleicaoId: string;
  base: string;
  titulo: string;
  periodo: string;
  encerrada: boolean;
  condominio: string;
  modo: "chapa" | "candidatos";
}) {
  // Link sem senha (formato antigo) precisa ser trocado.
  const link = l.codigo && l.senha ? `${base}/votar/${l.codigo}` : null;
  return (
    <div className="flex flex-col gap-2.5 rounded-2xl border border-line bg-surface-item p-3.5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-bold text-destaque">{l.rotulo}</p>
          {l.nome ? (
            <p className="break-words text-[0.92rem]">{l.nome}</p>
          ) : null}
          <p className="text-[0.85rem] text-muted">
            {l.telefones.length
              ? l.telefones.map(formatarTelefone).join(" · ")
              : "Sem telefone na lista"}
          </p>
          {l.senha && !l.votou ? (
            <p className="text-[0.85rem] text-ink-2">
              Senha da casa:{" "}
              <b className="font-mono tracking-widest text-ink">{l.senha}</b>
            </p>
          ) : null}
        </div>
        {l.votou ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-ok-soft px-2.5 py-0.5 text-[0.8rem] font-bold text-pine">
            <CircleCheck aria-hidden className="size-4" /> Já votou
          </span>
        ) : l.bloqueada ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-danger-soft px-2.5 py-0.5 text-[0.8rem] font-bold text-danger">
            <Ban aria-hidden className="size-4" /> Bloqueada
          </span>
        ) : null}
      </div>
      {link && !l.votou && !encerrada ? (
        <div className="flex flex-wrap items-end justify-between gap-2">
          <EnvioWhatsApp
            eleicaoId={eleicaoId}
            unitId={l.unitId}
            telefones={l.telefones}
            link={link}
            enviado={!!l.enviadoEm}
            mensagem={mensagemConvite({
              nome: l.nome,
              casa: l.rotulo,
              titulo,
              link,
              senha: l.senha ?? "",
              periodo,
              condominio,
              modo,
            })}
          />
          <AcaoConfirmada
            acao={trocarLinkCasa}
            campos={{ id: eleicaoId, unitId: l.unitId }}
            titulo={`Trocar o link da ${l.rotulo}?`}
            mensagem="Use se o link foi parar com quem não deveria. O link antigo para de funcionar na hora; envie o novo."
            textoConfirmar="Sim, trocar"
            variante="secundario"
          >
            <RefreshCw aria-hidden className="size-4" /> Trocar link
          </AcaoConfirmada>
        </div>
      ) : !link && !l.votou ? (
        <p className="text-[0.88rem] text-muted">
          Gere os links para enviar a esta casa.
        </p>
      ) : null}
    </div>
  );
}
