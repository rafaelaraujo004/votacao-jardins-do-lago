import type { Metadata } from "next";
import { Ban, KeyRound, UserCheck } from "lucide-react";
import { exigirPermissao } from "@/server/contexto";
import { minhasAutorizacoes, type Autorizacao } from "@/server/dados/portaria";
import { cancelarAutorizacao } from "@/server/acoes/portaria";
import { hojeISO } from "@/lib/formato";
import { ENDERECO_COMPLETO } from "@/lib/condominio";
import { descreverPeriodo, nomeTipoVisita } from "@/lib/portaria";
import { Alerta, Cartao, EstadoVazio } from "@/components/ui/basicos";
import { CabecalhoPagina, SegmentoLinks, TituloSecao } from "@/components/ui/painel";
import { AcaoConfirmada } from "@/components/ui/acao-confirmada";
import { AutorizarVisita } from "@/components/portaria/autorizar-visita";
import { EtiquetaVisita } from "@/components/portaria/pecas";

export const metadata: Metadata = { title: "Visitas" };

type Filtro = "ativas" | "usadas" | "vencidas";

const FILTROS: { valor: Filtro; rotulo: string }[] = [
  { valor: "ativas", rotulo: "Ativas" },
  { valor: "usadas", rotulo: "Usadas" },
  { valor: "vencidas", rotulo: "Vencidas e canceladas" },
];

function doFiltro(a: Autorizacao, filtro: Filtro): boolean {
  if (filtro === "ativas") return a.situacao === "valida_hoje" || a.situacao === "agendada";
  if (filtro === "usadas") return a.situacao === "usada";
  return a.situacao === "vencida" || a.situacao === "cancelada";
}

export default async function VisitasMorador({ searchParams }: PageProps<"/visitas">) {
  const { filtro: bruto } = await searchParams;
  // Sem login → /entrar, voltando para cá depois.
  const ctx = await exigirPermissao("visitantes.autorizar", bruto === "usadas" || bruto === "vencidas" ? `/visitas?filtro=${bruto}` : "/visitas");
  const cabecalho = (
    <CabecalhoPagina
      sobretitulo="Portaria"
      titulo="Autorizar visita"
      subtitulo="Gere um código para o visitante mostrar na portaria. Ele recebe tudo pelo WhatsApp."
    />
  );

  if (!ctx.unitId) {
    return (
      <div className="flex flex-col gap-5">
        {cabecalho}
        <Alerta tipo="aviso" titulo="Seu cadastro não está ligado a uma casa">
          Para autorizar visitas, a administração precisa ligar o seu cadastro à sua casa.
        </Alerta>
      </div>
    );
  }

  const filtro: Filtro = bruto === "usadas" || bruto === "vencidas" ? bruto : "ativas";
  const hoje = hojeISO(new Date(), ctx.fuso);
  const todas = await minhasAutorizacoes(ctx);
  const lista = todas.filter((a) => doFiltro(a, filtro));

  return (
    <div className="flex flex-col gap-5">
      {cabecalho}

      <Cartao>
        <AutorizarVisita hoje={hoje} unidadeRotulo={ctx.unidadeRotulo ?? "sua casa"} endereco={ENDERECO_COMPLETO} />
      </Cartao>

      <section className="flex flex-col gap-3" aria-labelledby="titulo-minhas">
        <TituloSecao id="titulo-minhas" extra={ctx.unidadeRotulo ?? undefined}>
          Minhas autorizações
        </TituloSecao>
        <SegmentoLinks
          rotulo="Filtrar autorizações"
          rolavel
          ariaCurrent="page"
          opcoes={FILTROS.map((f) => ({
            rotulo: f.rotulo,
            href: f.valor === "ativas" ? "/visitas" : `/visitas?filtro=${f.valor}`,
            ativo: f.valor === filtro,
          }))}
        />
        {lista.length === 0 ? (
          <EstadoVazio icone={UserCheck} titulo={filtro === "ativas" ? "Nenhuma autorização ativa" : "Nada por aqui"}>
            {filtro === "ativas" ? "Use o formulário acima para autorizar a próxima visita." : "As autorizações aparecem aqui conforme forem usadas ou vencerem."}
          </EstadoVazio>
        ) : (
          <ul className="flex flex-col gap-2">
            {lista.map((a) => (
              <li key={a.id}>
                <Cartao className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-lg font-bold">{a.nome}</p>
                      <EtiquetaVisita situacao={a.situacao} />
                    </div>
                    <p className="text-[0.92rem] text-ink-2">
                      {nomeTipoVisita(a.tipo)} · {descreverPeriodo(a.data, a.validaAte)} · {a.usoUnico ? "uso único" : "vários usos"}
                      {a.usos > 0 && !a.usoUnico ? ` · entrou ${a.usos} ${a.usos === 1 ? "vez" : "vezes"}` : ""}
                    </p>
                    {a.observacao ? <p className="text-[0.88rem] text-muted">{a.observacao}</p> : null}
                  </div>
                  {a.status === "ativa" && a.situacao !== "vencida" ? (
                    <AcaoConfirmada
                      acao={cancelarAutorizacao}
                      campos={{ id: a.id }}
                      titulo={`Cancelar a autorização de ${a.nome}?`}
                      mensagem="O código deixa de abrir a portaria na hora. A autorização continua no seu histórico como cancelada."
                      textoConfirmar="Sim, cancelar"
                      perigo
                    >
                      <Ban aria-hidden className="size-4" /> Cancelar autorização
                    </AcaoConfirmada>
                  ) : null}
                </Cartao>
              </li>
            ))}
          </ul>
        )}
        <p className="flex items-center gap-2 text-[0.88rem] text-muted">
          <KeyRound aria-hidden className="size-4 shrink-0" /> O código não fica guardado: se perder, cancele e gere outro.
        </p>
      </section>
    </div>
  );
}
