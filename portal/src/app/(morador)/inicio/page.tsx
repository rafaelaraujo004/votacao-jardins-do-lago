import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import {
  BookUser,
  CalendarDays,
  CalendarX2,
  ChevronRight,
  FlaskConical,
  MapPinned,
  Megaphone,
  ReceiptText,
  UserCheck,
  Vote,
  Wrench,
} from "lucide-react";
import { exigirPermissao, type Contexto } from "@/server/contexto";
import { mesesComSaldo } from "@/server/dados/financeiro";
import { eventosDoMes } from "@/server/dados/agenda";
import { formatarMoeda, hojeISO, saudacao } from "@/lib/formato";
import { nomeDoMes, type MesComSaldo } from "@/lib/financeiro";
import { COR_EVENTO, mesCurto } from "@/lib/agenda";
import { cx } from "@/lib/cx";
import { Cartao, EstadoVazio, Etiqueta } from "@/components/ui/basicos";
import { AtalhoModulo, BlocoNumero, FaixaPetalas, TituloSecao, type TomModulo } from "@/components/ui/painel";
import { EnderecoCopiavel } from "@/components/ui/endereco";
import { Calendario } from "@/components/ui/calendario";
import type { LucideIcon } from "lucide-react";

export const metadata: Metadata = { title: "Início" };

// Atalhos dos módulos. Sem "href" = ainda não pronto (aparece "Em breve" e não é clicável).
const ATALHOS: { icone: LucideIcon; titulo: string; href?: string; tom: TomModulo }[] = [
  { icone: ReceiptText, titulo: "Prestação de contas", href: "/financeiro", tom: "verde" },
  { icone: MapPinned, titulo: "Mapa das casas", href: "/mapa", tom: "lago" },
  { icone: Megaphone, titulo: "Comunicados", tom: "areia" },
  { icone: CalendarDays, titulo: "Reservas", tom: "verde" },
  { icone: UserCheck, titulo: "Visitas", tom: "lago" },
  { icone: Wrench, titulo: "Solicitações", tom: "areia" },
  { icone: Vote, titulo: "Votações", tom: "vinho" },
  { icone: BookUser, titulo: "Contatos úteis", href: "/contatos", tom: "vinho" },
];

/** Último mês publicado, ou null se ainda não houver (ou se a pessoa não puder ver). */
async function ultimoMesPublicado(ctx: Contexto): Promise<MesComSaldo | null | "erro"> {
  if (!ctx.permissoes.has("financeiro.ver_publicado") && !ctx.permissoes.has("financeiro.ver")) return null;
  try {
    const meses = await mesesComSaldo(ctx);
    return meses.filter((m) => m.publicado).at(-1) ?? null;
  } catch (erro) {
    // Se o financeiro falhar, a página inicial continua abrindo.
    console.error("Início: não foi possível carregar o resumo financeiro", erro);
    return "erro";
  }
}

export default async function InicioMorador() {
  const ctx = await exigirPermissao("area.morador");
  const primeiroNome = ctx.nome.split(" ")[0];

  // Mês atual no fuso do condomínio.
  const hoje = hojeISO(new Date(), ctx.fuso);
  const [ano, mes, dia] = hoje.split("-").map(Number);
  const proxAno = mes === 12 ? ano + 1 : ano;
  const proxMes = mes === 12 ? 1 : mes + 1;

  const [resumo, eventos, eventosProx] = await Promise.all([
    ultimoMesPublicado(ctx),
    eventosDoMes(ctx, ano, mes),
    eventosDoMes(ctx, proxAno, proxMes),
  ]);

  // Próximos eventos: de hoje em diante, deste mês e do seguinte.
  const proximos = [...eventos, ...eventosProx].filter((e) => e.data >= hoje).slice(0, 5);
  const temExemplo = eventos.some((e) => e.exemplo) || proximos.some((e) => e.exemplo);

  return (
    <div className="flex flex-col gap-6">
      {/* Identidade: logo em selo claro (claro também no modo escuro) + endereço */}
      <div className="grid gap-4 sm:grid-cols-2">
        <section
          aria-label="Residencial Jardins do Lago"
          className="surgir overflow-hidden rounded-[var(--radius-card)] border border-white bg-surface-clara pb-4 shadow-card"
        >
          <FaixaPetalas />
          <Image
            src="/logo-jardins-do-lago.png"
            alt="Residencial Jardins do Lago"
            width={630}
            height={358}
            priority
            className="mx-auto mt-4 h-auto w-[min(260px,74%)]"
          />
        </section>
        {/* O endereço fica num cartão normal: assim acompanha o tema claro/escuro sem ficar estranho. */}
        <Cartao aria-label="Endereço do condomínio" className="surgir flex flex-col justify-center p-4">
          <EnderecoCopiavel />
        </Cartao>
      </div>

      {/* Saudação */}
      <header>
        <h1 className="text-[1.7rem] font-bold text-destaque">
          {saudacao(new Date(), ctx.fuso)}, {primeiroNome}!
        </h1>
        <p className="mt-0.5 text-ink-2">{ctx.unidadeRotulo ?? "Bem-vindo ao portal do condomínio"}</p>
      </header>

      {/* Resumo do último mês publicado */}
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

      {/* Atalhos dos módulos */}
      <section aria-labelledby="titulo-atalhos" className="flex flex-col gap-3">
        <TituloSecao id="titulo-atalhos">O que você precisa?</TituloSecao>
        <ul className="grid grid-cols-3 gap-2.5 min-[360px]:grid-cols-4">
          {ATALHOS.map((a) => (
            <li key={a.titulo}>
              <AtalhoModulo {...a} />
            </li>
          ))}
        </ul>
      </section>

      {/* Agenda */}
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
            Quando a administração marcar reservas, manutenções ou assembleias, elas aparecem aqui.
          </EstadoVazio>
        )}
      </section>

      {/* Votações: módulo ainda não pronto (não clicável) */}
      <section
        aria-label="Votações e assembleias, em breve"
        className="flex items-center gap-3.5 rounded-[var(--radius-card)] bg-linear-135 from-vinho-de to-vinho-ate p-4 text-white shadow-card"
      >
        <span className="grid size-[46px] shrink-0 place-items-center rounded-[14px] bg-[rgb(255_255_255/0.16)]">
          <Vote aria-hidden className="size-6" />
        </span>
        <span className="min-w-0 flex-1">
          <b className="block font-display text-[1.1rem]">Votações e assembleias</b>
          <span className="text-[0.9rem] text-vinho-fg-suave">Vote pelo celular nas decisões do condomínio.</span>
        </span>
        <span className="shrink-0 rounded-full bg-[rgb(255_255_255/0.18)] px-2.5 py-1 text-[0.7rem] font-bold uppercase tracking-wide">
          Em breve
        </span>
      </section>
    </div>
  );
}
