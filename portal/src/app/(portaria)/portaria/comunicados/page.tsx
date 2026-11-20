import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Megaphone } from "lucide-react";
import { exigirPermissao } from "@/server/contexto";
import { listarPublicados } from "@/server/dados/comunicados";
import { ehNovo } from "@/lib/comunicados";
import { formatarData } from "@/lib/formato";
import { Cartao, EstadoVazio, TituloPagina } from "@/components/ui/basicos";
import { CartaoComunicado } from "@/components/comunicados/pecas";

export const metadata: Metadata = { title: "Comunicados" };

/** Comunicados publicados pela administração, para a equipe da portaria ler. */
export default async function ComunicadosPortaria() {
  const ctx = await exigirPermissao("comunicados.ver", "/portaria/comunicados");
  const lista = await listarPublicados(ctx);
  const agora = new Date();

  return (
    <div className="flex flex-col gap-5">
      <Cartao className="flex flex-col gap-4">
        <Link href="/portaria" className="flex min-h-11 w-fit items-center gap-1.5 font-bold text-lake">
          <ArrowLeft aria-hidden className="size-4" /> Voltar à portaria
        </Link>
        <TituloPagina sobretitulo="Avisos" titulo="Comunicados" descricao="Avisos publicados pela administração do condomínio." />
      </Cartao>
      {lista.length === 0 ? (
        <EstadoVazio icone={Megaphone} titulo="Nenhum comunicado publicado">
          Quando a administração publicar um aviso, ele aparece aqui.
        </EstadoVazio>
      ) : (
        <ul className="flex flex-col gap-2.5">
          {lista.map((c) => (
            <li key={c.id}>
              <CartaoComunicado
                foto={c.fotos[0]}
                href={`/portaria/comunicados/${c.id}`}
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
