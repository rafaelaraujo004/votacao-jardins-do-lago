import type { Metadata } from "next";
import Link from "next/link";
import {
  AlarmClock,
  ArrowLeft,
  CalendarRange,
  CircleCheck,
  CirclePause,
  Clock,
  ListChecks,
  Pencil,
  Plus,
  ShieldCheck,
  Sun,
  TreePalm,
  TriangleAlert,
  Users,
  Wrench,
  Zap,
} from "lucide-react";
import { exigirPermissao } from "@/server/contexto";
import { listarAreas } from "@/server/dados/reservas";
import { criarAreasSugeridas } from "@/server/acoes/reservas";
import { AREAS_SUGERIDAS, ROTULO_TIPO, descreverFaixa, horaCurta, textoHoras, type ConfigArea } from "@/lib/reservas";
import { Cartao, EstadoVazio, Etiqueta, TituloPagina } from "@/components/ui/basicos";
import { BotaoLink } from "@/components/ui/botao";
import { BotaoEnviar, Formulario } from "@/components/ui/formulario";
import { TituloSecao } from "@/components/ui/painel";

export const metadata: Metadata = { title: "Áreas de lazer" };

export default async function AreasDeLazer() {
  const ctx = await exigirPermissao("areas.configurar");
  const areas = await listarAreas(ctx);
  const deLazer = areas.filter((a) => a.tipo === "area");
  const equipamentos = areas.filter((a) => a.tipo === "equipamento");

  return (
    <div className="flex flex-col gap-6">
      <Link href="/admin/reservas" className="flex min-h-11 w-fit items-center gap-1.5 font-bold text-lake">
        <ArrowLeft aria-hidden className="size-4" /> Agenda de reservas
      </Link>
      <TituloPagina
        sobretitulo="Configurações"
        titulo="Áreas e equipamentos"
        descricao="Regras, horários e limites de cada área ou equipamento. As mudanças valem para os próximos pedidos; reservas já feitas não mudam."
        acoes={
          <BotaoLink href="/admin/reservas/areas/nova" icone={<Plus aria-hidden className="size-5" />}>
            Nova área ou equipamento
          </BotaoLink>
        }
      />

      {areas.length === 0 ? (
        <Cartao className="flex flex-col gap-3">
          <EstadoVazio icone={TreePalm} titulo="Nenhuma área cadastrada">
            Comece pelas sugestões e ajuste depois, ou cadastre uma por uma.
          </EstadoVazio>
          <h2 className="text-lg font-bold">Sugestões</h2>
          <ul className="flex flex-col gap-1.5 text-ink-2">
            {AREAS_SUGERIDAS.map((a) => (
              <li key={a.id}>
                <b className="text-ink">{a.nome}</b> ({ROTULO_TIPO[a.tipo].toLowerCase()}) —{" "}
                {a.faixas.length === 1 ? descreverFaixa(a.faixas[0]) : `${a.faixas.length} faixas de horário`};{" "}
                {a.exigeAprovacao ? "exige aprovação" : "confirma na hora"}
              </li>
            ))}
          </ul>
          <p className="text-[0.92rem] text-muted">A piscina fica de fora: é de uso livre, sem reserva. Nenhuma taxa é criada.</p>
          <Formulario acao={criarAreasSugeridas}>
            <div>
              <BotaoEnviar textoEnviando="Criando…">Criar sugestões</BotaoEnviar>
            </div>
          </Formulario>
        </Cartao>
      ) : (
        <>
          <Grupo id="titulo-areas" titulo="Áreas de lazer" areas={deLazer} vazio="Nenhuma área de lazer cadastrada." />
          <Grupo id="titulo-equipamentos" titulo="Equipamentos" areas={equipamentos} vazio="Nenhum equipamento cadastrado (ex.: roçadeira, carrinho de mão)." />
        </>
      )}
    </div>
  );
}

function Grupo({ id, titulo, areas, vazio }: { id: string; titulo: string; areas: ConfigArea[]; vazio: string }) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-3">
      <TituloSecao id={id} extra={areas.length ? String(areas.length) : undefined}>
        {titulo}
      </TituloSecao>
      {areas.length === 0 ? (
        <p className="text-ink-2">{vazio}</p>
      ) : (
        <ul className="grid gap-4 md:grid-cols-2">
          {areas.map((a) => (
            <li key={a.id}>
              <CartaoArea area={a} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function CartaoArea({ area: a }: { area: ConfigArea }) {
  const Icone = a.tipo === "equipamento" ? Wrench : TreePalm;
  const item = "flex items-start gap-2";
  const icone = "mt-0.5 size-4 shrink-0 text-pine";
  return (
    <Cartao className="flex h-full flex-col gap-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h3 className="flex items-center gap-2 text-lg font-bold">
          <Icone aria-hidden className="size-5 text-pine" /> {a.nome}
        </h3>
        {a.ativa ? (
          <Etiqueta tom="ok" icone={CircleCheck}>
            Ativa
          </Etiqueta>
        ) : (
          <Etiqueta tom="neutro" icone={CirclePause}>
            Inativa
          </Etiqueta>
        )}
      </div>
      <ul className="flex flex-col gap-1 text-[0.92rem] text-ink-2">
        {a.tipo === "area" && a.capacidade > 0 ? (
          <li className={item}>
            <Users aria-hidden className={icone} /> Até {a.capacidade} pessoas
          </li>
        ) : null}
        <li className={item}>
          {a.exigeAprovacao ? <ShieldCheck aria-hidden className={icone} /> : <Zap aria-hidden className={icone} />}
          {a.exigeAprovacao ? "Exige aprovação da administração" : "Confirma na hora"}
        </li>
        <li className={item}>
          <Clock aria-hidden className={icone} />
          {a.antecedenciaMinimaHoras ? `Mínimo ${textoHoras(a.antecedenciaMinimaHoras)} antes` : "Sem antecedência mínima"} · até {a.antecedenciaMaxDias}{" "}
          dias à frente
        </li>
        <li className={item}>
          <CalendarRange aria-hidden className={icone} />
          {[
            a.limitePorMes ? `até ${a.limitePorMes} por casa/mês` : "sem limite mensal",
            a.limitePorCasaPorDia
              ? `até ${a.limitePorCasaPorDia} por casa/dia${a.permitirExtraSeDiaLivre ? " (mais, se o dia estiver livre)" : ""}`
              : "sem limite por dia",
          ].join(" · ")}
        </li>
        <li className={item}>
          <AlarmClock aria-hidden className={icone} />
          {a.prazoDesistenciaHoras ? `Desistência sem multa até ${textoHoras(a.prazoDesistenciaHoras)} antes` : "Sem prazo de desistência"}
        </li>
        {a.exigencias.length ? (
          <li className={item}>
            <ListChecks aria-hidden className={icone} />
            {a.exigencias.length === 1 ? "1 exigência (“Li e concordo”)" : `${a.exigencias.length} exigências (“Li e concordo”)`}
          </li>
        ) : null}
        {a.avisos.length ? (
          <li className={item}>
            <TriangleAlert aria-hidden className={icone} />
            {a.avisos.length === 1 ? "1 aviso em destaque" : `${a.avisos.length} avisos em destaque`}
          </li>
        ) : null}
        {a.faixasLivres.length ? (
          <li className={item}>
            <Sun aria-hidden className={icone} />
            Uso livre: {a.faixasLivres.map((f) => `${horaCurta(f.inicio)} às ${horaCurta(f.fim)}`).join(", ")}
          </li>
        ) : null}
      </ul>
      <p className="text-[0.9rem] text-muted">
        {a.faixas.length <= 3
          ? a.faixas.map((f) => descreverFaixa(f)).join(" · ")
          : `${a.faixas.length} faixas, de ${a.faixas[0]?.inicio} a ${a.faixas.at(-1)?.fim}`}
      </p>
      <div className="mt-auto">
        <BotaoLink href={`/admin/reservas/areas/${a.id}`} variante="secundario" tamanho="pequeno" icone={<Pencil aria-hidden className="size-4" />}>
          Editar
        </BotaoLink>
      </div>
    </Cartao>
  );
}
