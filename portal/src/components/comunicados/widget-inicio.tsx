import "server-only";
/**
 * Bloco "Comunicados" do Início do morador: os 3 mais importantes
 * (fixados e urgentes primeiro, depois os mais recentes).
 * Uso no Início: <WidgetComunicados ctx={ctx} />
 *
 * Se o perfil não pode ver comunicados, não mostra nada.
 * Se o banco falhar, mostra um aviso curto e o Início continua abrindo.
 */
import Link from "next/link";
import { ChevronRight, Megaphone } from "lucide-react";
import type { Contexto } from "@/server/contexto";
import { destaquesParaInicio, type ComunicadoMorador } from "@/server/dados/comunicados";
import { ehNovo } from "@/lib/comunicados";
import { formatarData } from "@/lib/formato";
import { Cartao, EstadoVazio } from "@/components/ui/basicos";
import { TituloSecao } from "@/components/ui/painel";
import { CartaoComunicado } from "./pecas";

async function carregar(ctx: Contexto): Promise<ComunicadoMorador[] | "erro"> {
  try {
    return await destaquesParaInicio(ctx, 3);
  } catch (erro) {
    console.error("Início: não foi possível carregar os comunicados", erro);
    return "erro";
  }
}

export async function WidgetComunicados({ ctx }: { ctx: Contexto }) {
  if (!ctx.permissoes.has("comunicados.ver")) return null;
  const lista = await carregar(ctx);
  const agora = new Date();

  return (
    <section aria-labelledby="titulo-comunicados" className="flex flex-col gap-3">
      <TituloSecao
        id="titulo-comunicados"
        extra={
          lista !== "erro" && lista.length ? (
            <Link href="/comunicados" className="inline-flex min-h-11 items-center font-bold text-pine">
              Ver todos <ChevronRight aria-hidden className="size-4" />
            </Link>
          ) : undefined
        }
      >
        Comunicados
      </TituloSecao>

      {lista === "erro" ? (
        <Cartao className="p-4">
          <p className="text-ink-2">Não foi possível carregar os comunicados agora. Tente novamente mais tarde.</p>
        </Cartao>
      ) : lista.length === 0 ? (
        <EstadoVazio icone={Megaphone} titulo="Nenhum comunicado no momento">
          Os avisos da administração aparecem aqui.
        </EstadoVazio>
      ) : (
        <ul className="flex flex-col gap-2.5">
          {lista.map((c) => (
            <li key={c.id}>
              <CartaoComunicado
                foto={c.fotos[0]}
                href={`/comunicados/${c.id}`}
                titulo={c.titulo}
                texto={c.texto}
                prioridade={c.prioridade}
                fixado={c.fixado}
                novo={ehNovo(c.publicadoEm, agora)}
                data={c.publicadoEm ? `Publicado em ${formatarData(c.publicadoEm, ctx.fuso)}` : undefined}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
