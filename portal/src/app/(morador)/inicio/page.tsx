import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import {
  BookUser,
  CalendarDays,
  CalendarX2,
  ChevronRight,
  ClipboardPlus,
  FlaskConical,
  FolderOpen,
  MapPinned,
  Megaphone,
  Package,
  ReceiptText,
  Store,
  UserCheck,
  Vote,
} from "lucide-react";
import { exigirPermissao, type Contexto } from "@/server/contexto";
import type { Permissao } from "@/lib/permissoes";
import { WidgetComunicados } from "@/components/comunicados/widget-inicio";
import { WidgetEnquetes } from "@/components/enquetes/widget-inicio";
import { WidgetSolicitacoes } from "@/components/solicitacoes/widget-inicio";
import { WidgetInformacoesInicio } from "@/components/informacoes/widget-inicio";
import { WidgetDocumentos } from "@/components/documentos/widget-inicio";
import { WidgetClassificados } from "@/components/classificados/widget-inicio";
import { mesesPublicados } from "@/server/dados/morador";
import { eventosDoMes } from "@/server/dados/agenda";
import { formatarMoeda, hojeISO, saudacao } from "@/lib/formato";
import { nomeDoMes, type MesComSaldo } from "@/lib/financeiro";
import { COR_EVENTO, mesCurto } from "@/lib/agenda";
import { cx } from "@/lib/cx";
import { Cartao, EstadoVazio, Etiqueta } from "@/components/ui/basicos";
import { IlustracaoCondominio } from "@/components/ui/ilustracao-condominio";
import { AtalhoModulo, BlocoNumero, FaixaPetalas, TituloSecao, type TomModulo } from "@/components/ui/painel";
import { EnderecoCopiavel } from "@/components/ui/endereco";
import { Calendario } from "@/components/ui/calendario";
import type { LucideIcon } from "lucide-react";

export const metadata: Metadata = { title: "Início" };

// Atalhos dos módulos (só aparecem os que o perfil pode usar).
const ATALHOS: { icone: LucideIcon; titulo: string; href: string; tom: TomModulo; permissao: Permissao }[] = [
  { icone: ReceiptText, titulo: "Prestação de contas", href: "/financeiro", tom: "verde", permissao: "financeiro.ver_publicado" },
  { icone: CalendarDays, titulo: "Agenda das áreas", href: "/reservas", tom: "verde", permissao: "reservas.fazer" },
  { icone: ClipboardPlus, titulo: "Informar problema", href: "/solicitacoes?nova=1", tom: "areia", permissao: "solicitacoes.abrir" },
  { icone: Megaphone, titulo: "Comunicados", href: "/comunicados", tom: "areia", permissao: "comunicados.ver" },
  { icone: UserCheck, titulo: "Autorizar visita", href: "/visitas", tom: "lago", permissao: "visitantes.autorizar" },
  { icone: Package, titulo: "Minhas encomendas", href: "/encomendas", tom: "areia", permissao: "encomendas.ver_proprias" },
  { icone: Vote, titulo: "Enquetes", href: "/enquetes", tom: "vinho", permissao: "enquetes.votar" },
  { icone: Store, titulo: "Classificados", href: "/classificados", tom: "areia", permissao: "classificados.usar" },
  { icone: FolderOpen, titulo: "Documentos", href: "/documentos", tom: "lago", permissao: "documentos.ver" },
  { icone: MapPinned, titulo: "Mapa das casas", href: "/mapa", tom: "lago", permissao: "mapa.ver" },
  { icone: BookUser, titulo: "Contatos úteis", href: "/contatos", tom: "vinho", permissao: "informacoes.ver" },
];

/** Último mês PUBLICADO, ou null se ainda não houver. */
async function ultimoMesPublicado(ctx: Contexto): Promise<MesComSaldo | null | "erro"> {
  // Perfil sem acesso à prestação de contas: o resumo simplesmente não aparece.
  if (!ctx.permissoes.has("financeiro.ver_publicado")) return null;
  try {
    return (await mesesPublicados(ctx)).at(-1) ?? null;
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

/** Resumo do último mês publicado (chega logo depois do resto da tela). */
async function ResumoInicio({ ctx }: { ctx: Contexto }) {
  const resumo = await ultimoMesPublicado(ctx);
  return (
  <section aria-labelledby="titulo-resumo">
    {resumo && resumo !== "erro" ? (
      <Link
        href="/financeiro"
        className="block rounded-[var(--radius-card)] border border-borda-luz bg-surface p-4 shadow-card transition-shadow active:shadow-afundado"
      >
        <div className="mb-3 flex items-baseline justify-between gap-3">
          <h2 id="titulo-resumo" className="text-[1.1rem] font-bold text-destaque">
            Resumo de {nomeDoMes(resumo.mes)}
          </h2>
          <span className="inline-flex shrink-0 items-center text-[0.88rem] font-bold text-pine">
            Ver contas <ChevronRight aria-hidden className="size-4" />
          </span>
        </div>
        {/* Em telas pequenas o saldo ocupa a linha toda; receitas e despesas ficam lado a lado. */}
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
          <BlocoNumero rotulo="Saldo" valor={formatarMoeda(resumo.saldoFinalCentavos)} cor="pine" className="col-span-2 sm:col-span-1" />
          <BlocoNumero rotulo="Receitas" valor={formatarMoeda(resumo.receitasCentavos)} cor="lake" />
          <BlocoNumero rotulo="Despesas" valor={formatarMoeda(resumo.despesasCentavos)} cor="plum" />
        </div>
      </Link>
    ) : (
      <Cartao className="p-4">
        <h2 id="titulo-resumo" className="text-[1.1rem] font-bold text-destaque">
          Prestação de contas
        </h2>
        <p className="mt-1 text-ink-2">
          {resumo === "erro"
            ? "Não foi possível carregar o resumo agora. Tente novamente mais tarde."
            : "A primeira prestação de contas ainda não foi publicada."}
        </p>
      </Cartao>
    )}
  </section>
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
      Agenda do condomínio
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
      {/* Identidade: ilustração do condomínio + endereço */}
      <div className="grid gap-4 sm:grid-cols-2">
        <section
          aria-label={ctx.condominioNome}
          className="surgir overflow-hidden rounded-[var(--radius-card)] border border-borda-luz shadow-card"
        >
          <FaixaPetalas />
          <IlustracaoCondominio />
        </section>
        {/* O endereço fica num cartão normal: assim acompanha o tema claro/escuro sem ficar estranho. */}
        <Cartao aria-label="Endereço do condomínio" className="surgir flex flex-col justify-center p-4">
          <EnderecoCopiavel />
        </Cartao>
      </div>

      {/* Saudação */}
      <header>
        <h1 className="text-[1.7rem] font-bold text-destaque">
          {saudacao(new Date(), ctx.fuso)}!
        </h1>
        <p className="mt-0.5 text-ink-2">Bem-vindo ao portal do {ctx.condominioNome}.</p>
      </header>

      {/* Comunicados recentes (o urgente aparece cedo) */}
      <Suspense fallback={<BlocoCarregando altura="h-28" />}>
        <WidgetComunicados ctx={ctx} />
      </Suspense>

      {/* Resumo do último mês publicado */}
      <Suspense fallback={<BlocoCarregando altura="h-40" />}>
        <ResumoInicio ctx={ctx} />
      </Suspense>

      {/* Atalhos dos módulos */}
      <section aria-labelledby="titulo-atalhos" className="flex flex-col gap-3">
        <TituloSecao id="titulo-atalhos">O que você precisa?</TituloSecao>
        {/* 3 por linha no celular (nomes como "Classificados" não cabem em 4 colunas a 360px). */}
        <ul className="grid grid-cols-3 gap-2.5 min-[440px]:grid-cols-4">
          {atalhos.map((a) => (
            <li key={a.titulo}>
              <AtalhoModulo icone={a.icone} titulo={a.titulo} href={a.href} tom={a.tom} />
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
