import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { exigirPermissao } from "@/server/contexto";
import { meuAnuncio } from "@/server/dados/classificados";
import { podeEditar, primeiroNome } from "@/lib/classificados";
import { Alerta, Cartao } from "@/components/ui/basicos";
import { CabecalhoPagina } from "@/components/ui/painel";
import { LinkVoltarFaixa } from "@/components/ui/link-voltar";
import { FormularioAnuncio } from "@/components/classificados/formulario-anuncio";

export const metadata: Metadata = { title: "Editar anúncio" };

/**
 * O autor edita o próprio anúncio (aguardando, publicado ou não aprovado).
 * Ao salvar, o anúncio volta para "aguardando aprovação".
 * Anúncio de outra pessoa, inexistente, removido ou expirado → "não encontrado".
 */
export default async function EditarAnuncio({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await exigirPermissao("classificados.usar", "/classificados?aba=meus");
  const agora = new Date();
  const a = await meuAnuncio(ctx, id, agora);
  if (!a || !podeEditar(a.situacao, a.expiraEm, agora)) notFound();

  return (
    <div className="flex flex-col gap-5">
      <LinkVoltarFaixa href="/classificados?aba=meus">Meus anúncios</LinkVoltarFaixa>
      <CabecalhoPagina sobretitulo="Classificados" titulo="Editar anúncio" subtitulo={`“${a.titulo}”`} />
      {a.situacao === "rejeitado" && a.motivo ? (
        <Alerta tipo="aviso" titulo="Por que não foi aprovado">
          {a.motivo}
        </Alerta>
      ) : null}
      <Alerta tipo="info" titulo="Depois de salvar">
        {a.situacao === "aprovado"
          ? "O anúncio sai do ar e volta a aparecer quando a administração aprovar de novo (ela confere toda mudança)."
          : "O anúncio vai para a aprovação da administração."}
      </Alerta>
      <Cartao className="p-4 sm:p-5">
        <FormularioAnuncio
          primeiroNome={primeiroNome(ctx.nome)}
          anuncio={{
            id: a.id,
            titulo: a.titulo,
            texto: a.texto,
            categoria: a.categoria,
            preco: a.preco,
            contatoWhatsapp: a.contatoWhatsapp,
            fotos: a.fotos,
          }}
        />
      </Cartao>
    </div>
  );
}
