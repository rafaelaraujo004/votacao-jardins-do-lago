import type { Metadata } from "next";
import { exigirPermissao } from "@/server/contexto";
import { documentosVisiveis, type DocumentoVisivel } from "@/server/dados/documentos";
import { Alerta } from "@/components/ui/basicos";
import { CabecalhoPagina } from "@/components/ui/painel";
import { ListaDocumentos } from "@/components/documentos/lista-documentos";

export const metadata: Metadata = { title: "Documentos" };

/** Documentos do condomínio (com login): só os ativos e liberados para o perfil da pessoa. */
export default async function DocumentosMorador() {
  const ctx = await exigirPermissao("documentos.ver", "/documentos");

  let docs: DocumentoVisivel[] | null = null;
  try {
    docs = await documentosVisiveis(ctx);
  } catch (erro) {
    console.error("Documentos: não foi possível carregar a lista", erro);
  }

  return (
    <div className="flex flex-col gap-6">
      <CabecalhoPagina
        sobretitulo="Documentos"
        titulo="Documentos do residencial"
        subtitulo="Toque em um documento para abrir. Ele abre em outra aba (Google Drive ou outro serviço)."
      />
      {docs ? (
        <ListaDocumentos documentos={docs} fuso={ctx.fuso} />
      ) : (
        <Alerta tipo="erro" titulo="Não foi possível carregar os documentos">
          Tente de novo em instantes. Se continuar, avise a administração.
        </Alerta>
      )}
    </div>
  );
}
