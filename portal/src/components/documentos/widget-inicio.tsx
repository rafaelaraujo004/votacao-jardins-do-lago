/**
 * Cartão "Documentos" para o Início do morador (componente de servidor).
 * Mostra os 3 mais recentes e um link para a lista completa.
 * Se o perfil não pode ver documentos, não aparece; se o banco falhar, também não
 * (o Início continua abrindo).
 */
import Link from "next/link";
import { ChevronRight, FolderOpen } from "lucide-react";
import type { Contexto } from "@/server/contexto";
import { documentosRecentes, type DocumentoVisivel } from "@/server/dados/documentos";
import { Cartao } from "@/components/ui/basicos";
import { TituloSecao } from "@/components/ui/painel";
import { LinkDocumento } from "./pecas";

export async function WidgetDocumentos({ ctx }: { ctx: Contexto }) {
  if (!ctx.permissoes.has("documentos.ver")) return null;

  let docs: DocumentoVisivel[];
  try {
    docs = await documentosRecentes(ctx, 3);
  } catch (erro) {
    console.error("Início: não foi possível carregar os documentos", erro);
    return null;
  }

  return (
    <section aria-labelledby="titulo-documentos-inicio" className="flex flex-col gap-3">
      <TituloSecao
        id="titulo-documentos-inicio"
        extra={
          <Link href="/documentos" className="inline-flex min-h-11 items-center gap-1 font-bold text-lake">
            Ver todos <ChevronRight aria-hidden className="size-4" />
          </Link>
        }
      >
        Documentos
      </TituloSecao>
      {docs.length ? (
        <ul className="flex flex-col gap-2.5">
          {docs.map((d) => (
            <li key={d.id}>
              <LinkDocumento doc={d} fuso={ctx.fuso} />
            </li>
          ))}
        </ul>
      ) : (
        <Cartao className="flex items-center gap-3 text-ink-2">
          <FolderOpen aria-hidden className="size-6 shrink-0 text-pine" />
          Nenhum documento publicado ainda.
        </Cartao>
      )}
    </section>
  );
}
