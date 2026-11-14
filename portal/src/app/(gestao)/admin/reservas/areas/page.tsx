import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, CircleCheck, CirclePause, Clock, Pencil, Plus, ShieldCheck, TreePalm, Users, Zap } from "lucide-react";
import { exigirPermissao } from "@/server/contexto";
import { listarAreas } from "@/server/dados/reservas";
import { criarAreasSugeridas } from "@/server/acoes/reservas";
import { AREAS_SUGERIDAS, descreverFaixa } from "@/lib/reservas";
import { Cartao, EstadoVazio, Etiqueta, TituloPagina } from "@/components/ui/basicos";
import { BotaoLink } from "@/components/ui/botao";
import { BotaoEnviar, Formulario } from "@/components/ui/formulario";

export const metadata: Metadata = { title: "Áreas de lazer" };

export default async function AreasDeLazer() {
  const ctx = await exigirPermissao("areas.configurar");
  const areas = await listarAreas(ctx);

  return (
    <div className="flex flex-col gap-6">
      <Link href="/admin/reservas" className="flex min-h-11 w-fit items-center gap-1.5 font-bold text-lake">
        <ArrowLeft aria-hidden className="size-4" /> Agenda de reservas
      </Link>
      <TituloPagina
        sobretitulo="Configurações"
        titulo="Áreas de lazer"
        descricao="Regras, horários e limites de cada área. As mudanças valem para os próximos pedidos; reservas já feitas não mudam."
        acoes={
          <BotaoLink href="/admin/reservas/areas/nova" icone={<Plus aria-hidden className="size-5" />}>
            Nova área
          </BotaoLink>
        }
      />

      {areas.length === 0 ? (
        <Cartao className="flex flex-col gap-3">
          <EstadoVazio icone={TreePalm} titulo="Nenhuma área cadastrada">
            Comece pelas áreas sugeridas e ajuste depois, ou cadastre uma por uma.
          </EstadoVazio>
          <h2 className="text-lg font-bold">Áreas sugeridas</h2>
          <ul className="flex flex-col gap-1.5 text-ink-2">
            {AREAS_SUGERIDAS.map((a) => (
              <li key={a.id}>
                <b className="text-ink">{a.nome}</b> — {a.faixas.length === 1 ? descreverFaixa(a.faixas[0]) : `${a.faixas.length} faixas de horário`};{" "}
                {a.exigeAprovacao ? "exige aprovação" : "confirma na hora"}
              </li>
            ))}
          </ul>
          <p className="text-[0.92rem] text-muted">A piscina fica de fora: é de uso livre, sem reserva. Nenhuma taxa é criada.</p>
          <Formulario acao={criarAreasSugeridas}>
            <div>
              <BotaoEnviar textoEnviando="Criando…">Criar áreas sugeridas</BotaoEnviar>
            </div>
          </Formulario>
        </Cartao>
      ) : (
        <ul className="grid gap-4 md:grid-cols-2">
          {areas.map((a) => (
            <li key={a.id}>
              <Cartao className="flex h-full flex-col gap-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <h2 className="text-lg font-bold">{a.nome}</h2>
                  {a.ativa ? (
                    <Etiqueta tom="ok" icone={CircleCheck}>Ativa</Etiqueta>
                  ) : (
                    <Etiqueta tom="neutro" icone={CirclePause}>Inativa</Etiqueta>
                  )}
                </div>
                <ul className="flex flex-col gap-1 text-[0.92rem] text-ink-2">
                  <li className="flex items-center gap-2">
                    <Users aria-hidden className="size-4 text-pine" /> Até {a.capacidade} pessoas
                  </li>
                  <li className="flex items-center gap-2">
                    {a.exigeAprovacao ? <ShieldCheck aria-hidden className="size-4 text-pine" /> : <Zap aria-hidden className="size-4 text-pine" />}
                    {a.exigeAprovacao ? "Exige aprovação da administração" : "Confirma na hora"}
                  </li>
                  <li className="flex items-center gap-2">
                    <Clock aria-hidden className="size-4 text-pine" />
                    De {a.antecedenciaMinDias} a {a.antecedenciaMaxDias} dias de antecedência ·{" "}
                    {a.limitePorMes ? `até ${a.limitePorMes} por casa/mês` : "sem limite mensal"}
                  </li>
                </ul>
                <p className="text-[0.9rem] text-muted">
                  {a.faixas.length <= 3 ? a.faixas.map((f) => descreverFaixa(f)).join(" · ") : `${a.faixas.length} faixas, de ${a.faixas[0]?.inicio} a ${a.faixas.at(-1)?.fim}`}
                </p>
                <div className="mt-auto">
                  <BotaoLink href={`/admin/reservas/areas/${a.id}`} variante="secundario" tamanho="pequeno" icone={<Pencil aria-hidden className="size-4" />}>
                    Editar
                  </BotaoLink>
                </div>
              </Cartao>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
