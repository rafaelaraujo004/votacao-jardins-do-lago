import type { Metadata } from "next";
import { Package, PackageCheck } from "lucide-react";
import { exigirPermissao } from "@/server/contexto";
import { minhasEncomendas, type Encomenda } from "@/server/dados/portaria";
import { formatarDataHora } from "@/lib/formato";
import { nomeTipoEncomenda } from "@/lib/portaria";
import { Alerta, Cartao, EstadoVazio } from "@/components/ui/basicos";
import { CabecalhoPagina, TituloSecao } from "@/components/ui/painel";
import { EtiquetaEncomenda } from "@/components/portaria/pecas";

export const metadata: Metadata = { title: "Encomendas" };

function ItemEncomenda({ e, fuso }: { e: Encomenda; fuso: string }) {
  return (
    <Cartao className="flex flex-col gap-1.5 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-lg font-bold">
          {nomeTipoEncomenda(e.tipo)} para {e.destinatario}
        </p>
        <EtiquetaEncomenda status={e.status} />
      </div>
      <p className="text-[0.92rem] text-ink-2">
        Chegou {e.recebidoEm ? formatarDataHora(e.recebidoEm, fuso) : "—"}
        {e.observacao ? ` · ${e.observacao}` : ""}
      </p>
      {e.status === "entregue" ? (
        <p className="text-[0.92rem] text-muted">
          Retirada por {e.retiradoPor || "—"}
          {e.entregueEm ? ` em ${formatarDataHora(e.entregueEm, fuso)}` : ""}
        </p>
      ) : null}
    </Cartao>
  );
}

export default async function EncomendasMorador() {
  const ctx = await exigirPermissao("encomendas.ver_proprias");
  const cabecalho = <CabecalhoPagina sobretitulo="Portaria" titulo="Encomendas" subtitulo="O que chegou para a sua casa na portaria." />;

  if (!ctx.unitId) {
    return (
      <div className="flex flex-col gap-5">
        {cabecalho}
        <Alerta tipo="aviso" titulo="Seu cadastro não está ligado a uma casa">
          A administração precisa ligar o seu cadastro à sua casa para mostrar as encomendas.
        </Alerta>
      </div>
    );
  }

  const { aguardando, entregues } = await minhasEncomendas(ctx);

  return (
    <div className="flex flex-col gap-5">
      {cabecalho}

      <section className="flex flex-col gap-3" aria-labelledby="titulo-aguardando">
        <TituloSecao id="titulo-aguardando" extra={`${aguardando.length}`}>
          Aguardando retirada
        </TituloSecao>
        {aguardando.length ? (
          <>
            <Alerta tipo="info" titulo="Retire na portaria">
              Leve um documento. Quem retirar fica registrado.
            </Alerta>
            <ul className="flex flex-col gap-2">
              {aguardando.map((e) => (
                <li key={e.id}>
                  <ItemEncomenda e={e} fuso={ctx.fuso} />
                </li>
              ))}
            </ul>
          </>
        ) : (
          <EstadoVazio icone={Package} titulo="Nada aguardando na portaria">
            Quando chegar algo para {ctx.unidadeRotulo ?? "a sua casa"}, aparece aqui.
          </EstadoVazio>
        )}
      </section>

      <section className="flex flex-col gap-3" aria-labelledby="titulo-entregues">
        <TituloSecao id="titulo-entregues" extra="últimas 10">
          Já entregues
        </TituloSecao>
        {entregues.length ? (
          <ul className="flex flex-col gap-2">
            {entregues.map((e) => (
              <li key={e.id}>
                <ItemEncomenda e={e} fuso={ctx.fuso} />
              </li>
            ))}
          </ul>
        ) : (
          <EstadoVazio icone={PackageCheck} titulo="Nenhuma encomenda entregue ainda" />
        )}
      </section>
    </div>
  );
}
