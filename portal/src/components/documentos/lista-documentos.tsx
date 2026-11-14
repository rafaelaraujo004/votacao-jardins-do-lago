/**
 * Lista dos documentos agrupada por categoria (morador e quem só pode ver).
 * Recebe só a lista fechada de campos (DocumentoVisivel).
 */
import { FolderOpen } from "lucide-react";
import { EstadoVazio } from "@/components/ui/basicos";
import { TituloSecao } from "@/components/ui/painel";
import { agruparPorCategoria } from "@/lib/documentos";
import type { DocumentoVisivel } from "@/server/dados/documentos";
import { LinkDocumento } from "./pecas";

export function ListaDocumentos({ documentos, fuso }: { documentos: DocumentoVisivel[]; fuso: string }) {
  if (documentos.length === 0) {
    return (
      <EstadoVazio icone={FolderOpen} titulo="Nenhum documento por aqui ainda">
        Quando a administração publicar o regimento, a convenção, as atas ou outros documentos, eles aparecem nesta página.
      </EstadoVazio>
    );
  }
  return (
    <div className="flex flex-col gap-6">
      {agruparPorCategoria(documentos).map((g) => (
        <section key={g.categoria} aria-labelledby={`grupo-${g.categoria}`} className="flex flex-col gap-3">
          <TituloSecao id={`grupo-${g.categoria}`} extra={g.itens.length === 1 ? "1 documento" : `${g.itens.length} documentos`}>
            {g.nome}
          </TituloSecao>
          <ul className="flex flex-col gap-2.5">
            {g.itens.map((d) => (
              <li key={d.id}>
                <LinkDocumento doc={d} fuso={fuso} />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
