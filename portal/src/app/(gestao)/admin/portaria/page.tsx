import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, ArrowRight, DoorOpen, Filter, LogIn, LogOut, Package, ShieldCheck, Trash2 } from "lucide-react";
import { exigirPermissao } from "@/server/contexto";
import { listarUnidades } from "@/server/dados/unidades";
import { historicoAcessos, historicoEncomendas } from "@/server/dados/portaria";
import { limparVisitantesAntigosAgora } from "@/server/acoes/portaria";
import { dataISOParaBR, formatarDataHora, hojeISO } from "@/lib/formato";
import { DIAS_RETENCAO_VISITANTES, dataISOValida, nomeTipoEncomenda, nomeTipoVisita, somarDias } from "@/lib/portaria";
import { esquemaFiltroHistorico } from "@/lib/validacao-portaria";
import { Alerta, Campo, Cartao, classeEntrada, EstadoVazio, Etiqueta, TituloPagina } from "@/components/ui/basicos";
import { Botao, BotaoLink } from "@/components/ui/botao";
import { SegmentoLinks } from "@/components/ui/painel";
import { AcaoConfirmada } from "@/components/ui/acao-confirmada";
import { EtiquetaEncomenda, horaDe } from "@/components/portaria/pecas";

export const metadata: Metadata = { title: "Portaria — histórico" };

export default async function PortariaGestao({ searchParams }: PageProps<"/admin/portaria">) {
  const ctx = await exigirPermissao("visitantes.ver_todos");
  const hoje = hojeISO(new Date(), ctx.fuso);
  const filtro = esquemaFiltroHistorico.parse(await searchParams);
  // Data inexistente no endereço (ex.: 2026-00-10) volta para hoje, sem quebrar a tela.
  const data = filtro.data && dataISOValida(filtro.data) && filtro.data <= hoje ? filtro.data : hoje;
  const aba = filtro.aba ?? "acessos";

  const unidades = await listarUnidades(ctx);
  const casa = unidades.find((u) => u.id === filtro.casa);
  const consulta = { data, unitId: casa?.id };
  const [acessos, encomendas] = await Promise.all([
    aba === "acessos" ? historicoAcessos(ctx, consulta) : Promise.resolve([]),
    aba === "encomendas" ? historicoEncomendas(ctx, consulta) : Promise.resolve([]),
  ]);

  const podeLimpar = ctx.permissoes.has("moradores.gerenciar");
  const link = (mudar: { data?: string; aba?: string }) => {
    const p = new URLSearchParams();
    p.set("aba", mudar.aba ?? aba);
    p.set("data", mudar.data ?? data);
    if (casa) p.set("casa", casa.id);
    return `/admin/portaria?${p.toString()}`;
  };

  return (
    <div className="flex flex-col gap-6">
      <TituloPagina
        sobretitulo="Portaria"
        titulo="Histórico da portaria"
        descricao="Entradas, saídas e encomendas registradas. Somente consulta: nada aqui pode ser alterado."
        acoes={
          ctx.permissoes.has("portaria.operar") ? (
            <BotaoLink href="/portaria" variante="secundario" icone={<DoorOpen aria-hidden className="size-5" />}>
              Abrir a tela da portaria
            </BotaoLink>
          ) : null
        }
      />

      <Alerta tipo="info" titulo={`Registros de visitantes são guardados por ${DIAS_RETENCAO_VISITANTES} dias (LGPD)`}>
        Depois disso, o nome do visitante é removido. O registro da entrada e da saída continua, sem o nome.
        {podeLimpar ? (
          <div className="mt-3">
            <AcaoConfirmada
              acao={limparVisitantesAntigosAgora}
              campos={{}}
              titulo="Remover nomes com mais de 90 dias?"
              mensagem="Os nomes (e observações) de visitantes com mais de 90 dias serão apagados para sempre. As entradas e saídas continuam registradas, sem o nome. Fica registrado na auditoria."
              textoConfirmar="Sim, remover nomes"
              perigo
            >
              <Trash2 aria-hidden className="size-4" /> Remover nomes antigos agora
            </AcaoConfirmada>
          </div>
        ) : null}
      </Alerta>

      <SegmentoLinks
        rotulo="O que mostrar"
        ariaCurrent="page"
        opcoes={[
          { rotulo: "Entradas e saídas", href: link({ aba: "acessos" }), ativo: aba === "acessos" },
          { rotulo: "Encomendas", href: link({ aba: "encomendas" }), ativo: aba === "encomendas" },
        ]}
      />

      {/* Filtro por GET: funciona até sem JavaScript, e o endereço pode ser guardado. */}
      <Cartao>
        <form method="get" action="/admin/portaria" className="grid items-end gap-4 sm:grid-cols-[1fr_1fr_auto]">
          <input type="hidden" name="aba" value={aba} />
          <Campo id="filtro-data" rotulo="Dia">
            <input id="filtro-data" name="data" type="date" max={hoje} defaultValue={data} className={classeEntrada} />
          </Campo>
          <Campo id="filtro-casa" rotulo="Casa">
            <select id="filtro-casa" name="casa" defaultValue={casa?.id ?? ""} className={classeEntrada}>
              <option value="">Todas as casas</option>
              {unidades.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.rotulo}
                </option>
              ))}
            </select>
          </Campo>
          <Botao type="submit" variante="primario" icone={<Filter aria-hidden className="size-5" />}>
            Filtrar
          </Botao>
        </form>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
          <Link href={link({ data: somarDias(data, -1) })} className="inline-flex min-h-11 items-center gap-1.5 font-bold text-lake">
            <ArrowLeft aria-hidden className="size-4" /> Dia anterior
          </Link>
          <strong className="text-lg">
            {dataISOParaBR(data)}
            {casa ? ` · ${casa.rotulo}` : ""}
          </strong>
          {data < hoje ? (
            <Link href={link({ data: somarDias(data, 1) })} className="inline-flex min-h-11 items-center gap-1.5 font-bold text-lake">
              Dia seguinte <ArrowRight aria-hidden className="size-4" />
            </Link>
          ) : (
            <span className="min-h-11 w-28" aria-hidden />
          )}
        </div>
      </Cartao>

      {aba === "acessos" ? (
        acessos.length === 0 ? (
          <EstadoVazio icone={DoorOpen} titulo="Nenhuma entrada ou saída neste dia" />
        ) : (
          <ul className="flex flex-col gap-2" aria-label="Entradas e saídas">
            {acessos.map((a) => (
              <li key={a.id}>
                <Cartao className="flex flex-col gap-1 p-4 sm:flex-row sm:items-center sm:gap-4">
                  <span className="w-16 shrink-0 font-display text-xl font-bold tabular-nums">{horaDe(a.quando, ctx.fuso)}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      {a.tipo === "entrada" ? (
                        <Etiqueta tom="ok" icone={LogIn}>Entrada</Etiqueta>
                      ) : (
                        <Etiqueta tom="neutro" icone={LogOut}>Saída</Etiqueta>
                      )}
                      <b className={a.anonimizado ? "text-muted italic" : ""}>{a.nome}</b>
                      {a.anonimizado ? <Etiqueta tom="neutro" icone={ShieldCheck}>LGPD</Etiqueta> : null}
                    </div>
                    <p className="text-[0.92rem] text-ink-2">
                      {a.unidadeRotulo} · {nomeTipoVisita(a.tipoVisita)} · {a.origem === "codigo" ? "com código" : "sem código (confirmado por telefone)"}
                      {a.registradoPor ? ` · por ${a.registradoPor}` : ""}
                      {a.tipo === "entrada" && a.dentro ? " · ainda dentro" : ""}
                    </p>
                  </div>
                </Cartao>
              </li>
            ))}
          </ul>
        )
      ) : encomendas.length === 0 ? (
        <EstadoVazio icone={Package} titulo="Nenhuma encomenda recebida neste dia" />
      ) : (
        <ul className="flex flex-col gap-2" aria-label="Encomendas">
          {encomendas.map((e) => (
            <li key={e.id}>
              <Cartao className="flex flex-col gap-1 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <b>
                    {e.unidadeRotulo} · {nomeTipoEncomenda(e.tipo)} para {e.destinatario}
                  </b>
                  <EtiquetaEncomenda status={e.status} />
                </div>
                <p className="text-[0.92rem] text-ink-2">
                  Recebida às {horaDe(e.recebidoEm, ctx.fuso)}
                  {e.recebidoPor ? ` por ${e.recebidoPor}` : ""}
                  {e.observacao ? ` · ${e.observacao}` : ""}
                </p>
                {e.status === "entregue" ? (
                  <p className="text-[0.92rem] text-muted">
                    Entregue a {e.retiradoPor}
                    {e.entregueEm ? ` em ${formatarDataHora(e.entregueEm, ctx.fuso)}` : ""}
                    {e.entreguePor ? ` por ${e.entreguePor}` : ""}
                  </p>
                ) : null}
              </Cartao>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
