import type { Metadata } from "next";
import { Megaphone } from "lucide-react";
import { exigirPermissao } from "@/server/contexto";
import { listarPublicados } from "@/server/dados/comunicados";
import { ehNovo } from "@/lib/comunicados";
import { formatarData } from "@/lib/formato";
import { EstadoVazio } from "@/components/ui/basicos";
import { CabecalhoPagina } from "@/components/ui/painel";
import { CartaoComunicado } from "@/components/comunicados/pecas";

export const metadata: Metadata = { title: "Comunicados" };

/** Comunicados publicados pela administração (sempre com login). */
export default async function ComunicadosMorador() {
  const ctx = await exigirPermissao("comunicados.ver", "/comunicados");
  const lista = await listarPublicados(ctx);
  const agora = new Date();
  const novos = lista.filter((c) => ehNovo(c.publicadoEm, agora)).length;

  return (
    <div className="flex flex-col gap-5">
      <CabecalhoPagina
        sobretitulo="Avisos"
        titulo="Comunicados"
        subtitulo={
          novos
            ? `${novos} ${novos === 1 ? "comunicado novo" : "comunicados novos"} nos últimos 7 dias.`
            : "Avisos da administração do condomínio."
        }
      />

      {lista.length === 0 ? (
        <EstadoVazio icone={Megaphone} titulo="Nenhum comunicado publicado">
          Quando a administração publicar um aviso, ele aparece aqui.
        </EstadoVazio>
      ) : (
        <ul className="flex flex-col gap-2.5">
          {lista.map((c) => (
            <li key={c.id}>
              <CartaoComunicado
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
    </div>
  );
}
