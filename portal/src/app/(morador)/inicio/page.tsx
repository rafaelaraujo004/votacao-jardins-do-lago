import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import {
  CalendarDays,
  CalendarX2,
  FlaskConical,
} from "lucide-react";
import { exigirPermissao, type Contexto } from "@/server/contexto";
import type { Permissao } from "@/lib/permissoes";
import { WidgetComunicados } from "@/components/comunicados/widget-inicio";
import { WidgetEnquetes } from "@/components/enquetes/widget-inicio";
import { WidgetEleicao } from "@/components/eleicoes/widget-inicio";
import { WidgetSolicitacoes } from "@/components/solicitacoes/widget-inicio";
import { WidgetInformacoesInicio } from "@/components/informacoes/widget-inicio";
import { WidgetDocumentos } from "@/components/documentos/widget-inicio";
import { WidgetClassificados } from "@/components/classificados/widget-inicio";
import { mesesPublicados } from "@/server/dados/morador";
import { eventosDoMes } from "@/server/dados/agenda";
import { hojeISO, saudacao } from "@/lib/formato";
import type { MesComSaldo } from "@/lib/financeiro";
import { COR_EVENTO, mesCurto } from "@/lib/agenda";
import { cx } from "@/lib/cx";
import { Cartao, EstadoVazio, Etiqueta } from "@/components/ui/basicos";
import { FotoCondominio } from "@/components/ui/foto-condominio";
import { FaixaPetalas, TituloSecao, type TomModulo } from "@/components/ui/painel";
import { ResumoFinanceiroPainel } from "@/components/financeiro/resumo-painel";
import { ResumoContasInicio } from "@/components/financeiro/resumo-inicio";
import { EnderecoCopiavel } from "@/components/ui/endereco";
import { Calendario } from "@/components/ui/calendario";
import { AtalhoComAjuda } from "@/components/ui/atalho-com-ajuda";
import type { NomeIconeAtalho } from "@/components/ui/icones-atalho";

export const metadata: Metadata = { title: "Início" };

// Atalhos dos módulos (só aparecem os que o perfil pode usar), cada um com o "i" que explica
// em linguagem simples para que serve. São 15: a grade fecha sem buracos em 3 colunas
// (celular) e em 5 (telas maiores).
const ATALHOS: {
  icone: NomeIconeAtalho;
  titulo: string;
  href: string;
  tom: TomModulo;
  permissao: Permissao;
  ajuda: string;
  rotuloAbrir?: string;
}[] = [
  { icone: "Award", titulo: "Votação oficial", href: "/votacao", tom: "vinho", permissao: "eleicoes.votar", ajuda: "Eleição do síndico e do conselho. Aqui você vê a chapa, o dia e o horário da votação e vota quando ela abrir. Vale um voto por casa e o voto é secreto: ninguém vê em quem a sua casa votou." },
  { icone: "ReceiptText", titulo: "Prestação de contas", href: "/financeiro", tom: "verde", permissao: "financeiro.ver_publicado", ajuda: "Para onde vai o dinheiro do Residencial Jardins do Lago: saldo, entradas e saídas de cada mês que a administração já conferiu e publicou." },
  { icone: "QrCode", titulo: "Pagar taxa", href: "/contatos#titulo-pix", tom: "verde", permissao: "informacoes.ver", ajuda: "Mostra a chave PIX e o nome do favorecido para pagar a taxa do residencial. É só copiar a chave e pagar no app do seu banco.", rotuloAbrir: "Ver o PIX" },
  { icone: "CalendarDays", titulo: "Agenda das áreas", href: "/reservas", tom: "verde", permissao: "reservas.fazer", ajuda: "Veja os horários livres da área de lazer, da quadra e dos equipamentos e peça a sua reserva. As regras de cada área aparecem lá." },
  { icone: "ClipboardPlus", titulo: "Informar problema", href: "/solicitacoes?nova=1", tom: "areia", permissao: "solicitacoes.abrir", ajuda: "Avise a administração sobre algo que precisa de atenção: lâmpada queimada, vazamento, barulho, sugestão. Você recebe um número de protocolo.", rotuloAbrir: "Informar agora" },
  { icone: "ClipboardList", titulo: "Minhas solicitações", href: "/solicitacoes", tom: "vinho", permissao: "solicitacoes.abrir", ajuda: "Acompanhe os pedidos que a sua casa já fez: se estão em aberto, em andamento ou resolvidos, e as respostas da administração." },
  { icone: "Megaphone", titulo: "Comunicados", href: "/comunicados", tom: "areia", permissao: "comunicados.ver", ajuda: "Avisos da administração para todos os moradores: manutenções, assembleias, regras e novidades." },
  { icone: "UserCheck", titulo: "Autorizar visita", href: "/visitas", tom: "lago", permissao: "visitantes.autorizar", ajuda: "Vai receber alguém? Autorize aqui e mande o código para o visitante. Na portaria, ele mostra o código e entra sem demora.", rotuloAbrir: "Autorizar agora" },
  { icone: "Package", titulo: "Minhas encomendas", href: "/encomendas", tom: "areia", permissao: "encomendas.ver_proprias", ajuda: "Veja as entregas que chegaram na portaria para a sua casa e se já foram retiradas." },
  { icone: "Vote", titulo: "Enquetes", href: "/enquetes", tom: "vinho", permissao: "enquetes.votar", ajuda: "Perguntas rápidas da administração para saber a opinião dos moradores (um voto por casa). É diferente da votação oficial." },
  { icone: "Store", titulo: "Classificados", href: "/classificados", tom: "areia", permissao: "classificados.usar", ajuda: "Compra, venda e serviços entre vizinhos. Você pode anunciar; o anúncio aparece depois que a administração aprovar." },
  { icone: "FolderOpen", titulo: "Documentos", href: "/documentos", tom: "lago", permissao: "documentos.ver", ajuda: "Regimento interno, convenção, atas de assembleia e outros documentos do Residencial Jardins do Lago." },
  { icone: "MapPinned", titulo: "Mapa das casas", href: "/mapa", tom: "lago", permissao: "mapa.ver", ajuda: "Encontre qualquer casa no desenho do residencial. Toque na casa e depois em \"Chegar\" para ver o caminho desde a portaria." },
  { icone: "BookUser", titulo: "Contatos úteis", href: "/contatos", tom: "vinho", permissao: "informacoes.ver", ajuda: "Telefones da portaria, da ronda noturna e da responsável pelas reservas, além do endereço e do PIX da taxa." },
  { icone: "KeyRound", titulo: "Trocar senha", href: "/conta/senha", tom: "lago", permissao: "area.morador", ajuda: "Troque a senha que você usa para entrar no portal. Use uma senha fácil de lembrar e difícil de adivinhar, e não passe para outras pessoas.", rotuloAbrir: "Trocar agora" },
];

/** Meses PUBLICADOS (com saldo), para os valores e o gráfico do Início. null = o perfil não vê as contas. */
async function mesesDoInicio(ctx: Contexto): Promise<MesComSaldo[] | null | "erro"> {
  // Perfil sem acesso à prestação de contas: o resumo simplesmente não aparece.
  if (!ctx.permissoes.has("financeiro.ver_publicado")) return null;
  try {
    return await mesesPublicados(ctx);
  } catch (erro) {
    // Se o financeiro falhar, a página inicial continua abrindo.
    console.error("Início: não foi possível carregar o resumo financeiro", erro);
    return "erro";
  }
}

/** Espaço reservado enquanto um bloco do Início carrega (evita a tela "pular"). */
function BlocoCarregando({ altura }: { altura: string }) {
  return <div aria-hidden className={cx("esqueleto w-full rounded-[var(--radius-card)]", altura)} />;
}

/**
 * Prestação de contas no Início: os valores do último mês PUBLICADO (saldo,
 * receitas, despesas) e o gráfico do saldo dos últimos meses, só com o que os
 * moradores podem ver. No celular, um cartão compacto que cabe na primeira tela;
 * em telas maiores, o mesmo bloco do painel do síndico.
 */
async function ResumoInicio({ ctx, className }: { ctx: Contexto; className?: string }) {
  const meses = await mesesDoInicio(ctx);
  if (meses === null) return null;
  if (meses === "erro") {
    return (
      <Cartao className={cx("p-4", className)}>
        <h2 className="text-[1.1rem] font-bold text-destaque">Prestação de contas</h2>
        <p className="mt-1 text-ink-2">Não foi possível carregar as contas agora. Tente novamente mais tarde.</p>
      </Cartao>
    );
  }
  return (
    <div className={className}>
      {/* Celular: cartão compacto (saldo, entradas, saídas e minigráfico) que cabe na primeira tela. */}
      <ResumoContasInicio meses={meses} className="sm:hidden" />
      {/* Telas maiores: o bloco completo, com os quatro números e o gráfico grande. */}
      <div className="hidden sm:block">
      <ResumoFinanceiroPainel
        meses={meses}
        mesAtual={hojeISO(new Date(), ctx.fuso).slice(0, 7)}
        saldoInicialCentavos={meses[0]?.saldoAnteriorCentavos ?? 0}
        visaoCompleta={false}
        href="/financeiro"
      />
      </div>
    </div>
  );
}

/** Agenda do mês e próximos eventos (chega logo depois do resto da tela). */
async function AgendaInicio({ ctx }: { ctx: Contexto }) {
  // Mês atual no fuso do condomínio.
  const hoje = hojeISO(new Date(), ctx.fuso);
  const [ano, mes, dia] = hoje.split("-").map(Number);
  const proxAno = mes === 12 ? ano + 1 : ano;
  const proxMes = mes === 12 ? 1 : mes + 1;

  const [eventos, eventosProx] = await Promise.all([
    eventosDoMes(ctx, ano, mes),
    eventosDoMes(ctx, proxAno, proxMes),
  ]);

  // Próximos eventos: de hoje em diante, deste mês e do seguinte.
  const proximos = [...eventos, ...eventosProx].filter((e) => e.data >= hoje).slice(0, 5);
  const temExemplo = eventos.some((e) => e.exemplo) || proximos.some((e) => e.exemplo);

  return (
  <section aria-labelledby="titulo-agenda" className="flex flex-col gap-3">
    <TituloSecao
      id="titulo-agenda"
      extra={
        temExemplo ? (
          <Etiqueta tom="aviso" icone={FlaskConical}>
            exemplo
          </Etiqueta>
        ) : undefined
      }
    >
      Agenda do residencial
    </TituloSecao>
    <Cartao className="p-4">
      <Calendario ano={ano} mes={mes} hoje={dia} eventos={eventos} />
    </Cartao>
    <Link
      href="/reservas"
      className="saltado inline-flex min-h-12 items-center justify-center gap-2 self-start rounded-full px-4 font-bold text-pine active:shadow-afundado"
    >
      <CalendarDays aria-hidden className="size-5" /> Ver horários livres das áreas
    </Link>

    <h3 className="mt-2 text-[1.05rem] font-bold text-destaque">Próximos eventos</h3>
    {proximos.length ? (
      <ul className="flex flex-col gap-2.5">
        {proximos.map((e) => (
          <li key={e.id} className="saltado flex items-center gap-3 rounded-2xl px-3 py-2.5">
            <span className="afundado flex h-[54px] w-[50px] shrink-0 flex-col items-center justify-center rounded-[14px] leading-none">
              <b className="font-display text-[1.25rem] font-extrabold text-destaque">{Number(e.data.slice(8))}</b>
              <small className="mt-1 text-[0.68rem] font-bold uppercase tracking-wide text-ink-2">{mesCurto(e.data)}</small>
            </span>
            <span className="min-w-0 flex-1">
              <b className="block leading-snug text-ink">{e.titulo}</b>
              <span className="text-[0.86rem] text-muted">{e.detalhe}</span>
              {e.exemplo ? (
                <span className="ml-1.5 rounded-full bg-sand px-2 py-px text-[0.68rem] font-bold uppercase tracking-wide text-ink-2">
                  exemplo
                </span>
              ) : null}
            </span>
            <i aria-hidden className={cx("size-[9px] shrink-0 rounded-full", COR_EVENTO[e.tipo])} />
          </li>
        ))}
      </ul>
    ) : (
      <EstadoVazio icone={CalendarX2} titulo="Nenhum evento marcado">
        Quando houver reservas das áreas de lazer, manutenções ou assembleias, elas aparecem aqui.
      </EstadoVazio>
    )}
  </section>
  );
}

/** Início do morador (com login): nada aqui identifica OUTRAS casas ou pessoas. */
export default async function InicioMorador() {
  const ctx = await exigirPermissao("area.morador", "/inicio");

  const atalhos = ATALHOS.filter((a) => ctx.permissoes.has(a.permissao));

  return (
    <div className="flex flex-col gap-6">
      {/* Identidade (ilustração + endereço) e a PRESTAÇÃO DE CONTAS com gráfico, na primeira tela.
          Celular: ilustração → contas → endereço. Telas maiores: ilustração | endereço e as contas embaixo. */}
      <div className="grid gap-4 sm:grid-cols-2">
        <section
          aria-label={ctx.condominioNome}
          className="surgir order-1 overflow-hidden rounded-[var(--radius-card)] border border-borda-luz shadow-card"
        >
          <FaixaPetalas />
          <FotoCondominio />
        </section>
        {/* O endereço fica num cartão normal: assim acompanha o tema claro/escuro sem ficar estranho. */}
        <Cartao semEspaco aria-label="Endereço do Residencial Jardins do Lago" className="surgir order-3 flex flex-col justify-center p-3 sm:order-2 sm:p-4">
          <EnderecoCopiavel />
        </Cartao>
        <Suspense fallback={<BlocoCarregando altura="order-2 h-64 sm:order-3 sm:col-span-2 sm:h-96" />}>
          <ResumoInicio ctx={ctx} className="order-2 sm:order-3 sm:col-span-2" />
        </Suspense>
      </div>

      {/* Saudação */}
      <header>
        <h1 className="text-[1.7rem] font-bold text-destaque">
          {saudacao(new Date(), ctx.fuso)}!
        </h1>
        <p className="mt-0.5 text-ink-2">Bem-vindo ao portal do {ctx.condominioNome}.</p>
      </header>

      {/* Votação oficial: logo abaixo da saudação, ACIMA de todos os outros avisos,
          enquanto houver uma agendada ou aberta (e o resultado nos 7 dias seguintes).
          Sem votação, não aparece nada. */}
      <Suspense fallback={null}>
        <WidgetEleicao ctx={ctx} />
      </Suspense>

      {/* Comunicados recentes (o urgente aparece cedo) */}
      <Suspense fallback={<BlocoCarregando altura="h-28" />}>
        <WidgetComunicados ctx={ctx} />
      </Suspense>

      {/* Atalhos dos módulos */}
      <section aria-labelledby="titulo-atalhos" className="flex flex-col gap-3">
        <TituloSecao id="titulo-atalhos">O que você precisa?</TituloSecao>
        {/* 3 por linha no celular (nomes como "Classificados" não cabem em 4 colunas a 360px); 5 em telas maiores. */}
        <ul className="grid grid-cols-3 gap-2.5 sm:grid-cols-5">
          {atalhos.map((a) => (
            <li key={a.titulo}>
              <AtalhoComAjuda
                icone={a.icone}
                titulo={a.titulo}
                href={a.href}
                tom={a.tom}
                ajuda={a.ajuda}
                rotuloAbrir={a.rotuloAbrir}
              />
            </li>
          ))}
        </ul>
      </section>

      {/* Enquete aberta (ou link para os resultados) */}
      <Suspense fallback={<BlocoCarregando altura="h-28" />}>
        <WidgetEnquetes ctx={ctx} />
      </Suspense>

      {/* Solicitações da casa */}
      <Suspense fallback={<BlocoCarregando altura="h-28" />}>
        <WidgetSolicitacoes ctx={ctx} />
      </Suspense>

      {/* Votação oficial, PIX da taxa e ronda noturna */}
      <Suspense fallback={<BlocoCarregando altura="h-32" />}>
        <WidgetInformacoesInicio ctx={ctx} />
      </Suspense>

      {/* Agenda */}
      <Suspense fallback={<BlocoCarregando altura="h-96" />}>
        <AgendaInicio ctx={ctx} />
      </Suspense>

      {/* Documentos recentes e classificados */}
      <Suspense fallback={<BlocoCarregando altura="h-28" />}>
        <WidgetDocumentos ctx={ctx} />
      </Suspense>
      <Suspense fallback={<BlocoCarregando altura="h-28" />}>
        <WidgetClassificados ctx={ctx} />
      </Suspense>
    </div>
  );
}
