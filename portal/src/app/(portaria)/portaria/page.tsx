import type { Metadata } from "next";
import { CalendarDays, DoorOpen, KeyRound, Package, PackagePlus, PhoneCall, UserCheck, Users } from "lucide-react";
import { exigirPermissao } from "@/server/contexto";
import { listarUnidades } from "@/server/dados/unidades";
import { dentroAgora, encomendasAguardando, entradasHoje, esperadosHoje } from "@/server/dados/portaria";
import { reservasDoDia } from "@/server/dados/reservas";
import { formatarData, hojeISO } from "@/lib/formato";
import { Cartao } from "@/components/ui/basicos";
import { BlocoNumero, TituloSecao } from "@/components/ui/painel";
import { ValidarCodigo } from "@/components/portaria/validar-codigo";
import { EntradaSemCodigo, NovaEncomenda } from "@/components/portaria/formularios-portaria";
import { ListaDentro, ListaEncomendasAguardando, ListaEsperados, ListaReservasHoje } from "@/components/portaria/listas";
import { AtualizarPortaria } from "@/components/portaria/atualizar";

export const metadata: Metadata = { title: "Portaria" };

/** Tela de trabalho da portaria: tudo numa tela só (pensada para tablet/computador, funciona no celular). */
export default async function PaginaPortaria() {
  const ctx = await exigirPermissao("portaria.operar");

  const [unidades, dentro, esperados, encomendas, entradas] = await Promise.all([
    listarUnidades(ctx),
    dentroAgora(ctx),
    esperadosHoje(ctx),
    encomendasAguardando(ctx),
    entradasHoje(ctx),
  ]);
  // Reservas do dia (só para quem pode ver todas). Se falharem, a portaria continua abrindo.
  const podeVerReservas = ctx.permissoes.has("reservas.ver_todas");
  const reservas = podeVerReservas
    ? await reservasDoDia(ctx, hojeISO(new Date(), ctx.fuso)).catch((erro) => {
        console.error("Portaria: não foi possível carregar as reservas do dia", erro);
        return null;
      })
    : null;

  const casas = unidades.filter((u) => u.status === "ativa").map(({ id, rotulo, numero, quadra }) => ({ id, rotulo, numero, quadra }));

  return (
    <div className="flex flex-col gap-5">
      <Cartao className="surgir flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <p className="rotulo-caixa text-plum">Hoje · {formatarData(new Date(), ctx.fuso)}</p>
          <h1 className="text-[1.8rem] font-bold text-destaque">Portaria</h1>
          <p className="text-ink-2">Visitantes, entradas e saídas e encomendas, numa tela só.</p>
        </div>
        <AtualizarPortaria />
      </Cartao>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <BlocoNumero rotulo="Dentro agora" valor={dentro.length} cor="lake" detalhe="visitantes no residencial" />
        <BlocoNumero rotulo="Esperados hoje" valor={esperados.length} cor="pine" detalhe="autorizações válidas" />
        <BlocoNumero rotulo="Encomendas aguardando" valor={encomendas.length} cor="plum" detalhe="na portaria" />
        <BlocoNumero rotulo="Entradas hoje" valor={entradas} cor="ink" detalhe="registradas" />
      </div>

      <div className="grid items-start gap-5 lg:grid-cols-2">
        <div className="flex flex-col gap-5">
          <Cartao className="flex flex-col gap-3" aria-labelledby="titulo-codigo">
            <TituloSecao id="titulo-codigo">
              <span className="inline-flex items-center gap-2">
                <KeyRound aria-hidden className="size-5" /> Validar código
              </span>
            </TituloSecao>
            <ValidarCodigo />
          </Cartao>

          <details className="group rounded-[var(--radius-card)] border border-borda-luz bg-surface shadow-card">
            <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 px-5 font-bold">
              <PhoneCall aria-hidden className="size-5 text-pine" />
              <span className="flex-1">Visitante sem código</span>
              <span className="text-[0.88rem] font-normal text-muted group-open:hidden">Abrir</span>
            </summary>
            <div className="flex flex-col gap-3 border-t border-line p-5">
              <p className="text-ink-2">Ligue para o morador, confirme e registre a entrada.</p>
              <EntradaSemCodigo casas={casas} />
            </div>
          </details>
        </div>

        <div className="flex flex-col gap-5">
          <Cartao className="flex flex-col gap-3" aria-labelledby="titulo-dentro">
            <TituloSecao id="titulo-dentro" extra={`${dentro.length} ${dentro.length === 1 ? "pessoa" : "pessoas"}`}>
              <span className="inline-flex items-center gap-2">
                <Users aria-hidden className="size-5" /> Quem está dentro agora
              </span>
            </TituloSecao>
            <ListaDentro pessoas={dentro} fuso={ctx.fuso} />
          </Cartao>

          <Cartao className="flex flex-col gap-3" aria-labelledby="titulo-esperados">
            <TituloSecao id="titulo-esperados" extra={`${esperados.length}`}>
              <span className="inline-flex items-center gap-2">
                <UserCheck aria-hidden className="size-5" /> Esperados hoje
              </span>
            </TituloSecao>
            <ListaEsperados autorizacoes={esperados} />
          </Cartao>
        </div>
      </div>

      <section className="flex flex-col gap-3" aria-labelledby="titulo-encomendas">
        <TituloSecao id="titulo-encomendas">
          <span className="inline-flex items-center gap-2">
            <Package aria-hidden className="size-5" /> Encomendas
          </span>
        </TituloSecao>
        <div className="grid items-start gap-5 lg:grid-cols-2">
          <Cartao className="flex flex-col gap-3">
            <h3 className="flex items-center gap-2 text-lg font-bold">
              <PackagePlus aria-hidden className="size-5 text-pine" /> Registrar encomenda
            </h3>
            <NovaEncomenda casas={casas} />
          </Cartao>
          <Cartao className="flex flex-col gap-3">
            <h3 className="flex items-center gap-2 text-lg font-bold">
              <DoorOpen aria-hidden className="size-5 text-pine" /> Aguardando retirada ({encomendas.length})
            </h3>
            <ListaEncomendasAguardando encomendas={encomendas} fuso={ctx.fuso} />
          </Cartao>
        </div>
      </section>

      {/* Só aparece para quem pode ver as reservas (senão a mensagem de "falhou" enganaria). */}
      {podeVerReservas ? (
        <Cartao className="flex flex-col gap-3" aria-labelledby="titulo-reservas">
          <TituloSecao id="titulo-reservas">
            <span className="inline-flex items-center gap-2">
              <CalendarDays aria-hidden className="size-5" /> Reservas de hoje
            </span>
          </TituloSecao>
          <ListaReservasHoje reservas={reservas} />
        </Cartao>
      ) : null}
    </div>
  );
}
