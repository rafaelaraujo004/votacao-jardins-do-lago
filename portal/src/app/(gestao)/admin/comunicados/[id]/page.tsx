import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Archive, ArrowLeft, CalendarDays, Pin, PinOff, Send } from "lucide-react";
import { exigirPermissao } from "@/server/contexto";
import { obterParaGestao, obterPublicado } from "@/server/dados/comunicados";
import { enderecoDoPortal } from "@/server/dados/acesso";
import { mudarComunicado } from "@/server/acoes/comunicados";
import { idDocumento } from "@/lib/validacao";
import { ehNovo, linkDoComunicado, mensagemWhatsApp } from "@/lib/comunicados";
import { formatarDataHora } from "@/lib/formato";
import { cx } from "@/lib/cx";
import { Alerta, Cartao, TituloPagina } from "@/components/ui/basicos";
import { AcaoConfirmada } from "@/components/ui/acao-confirmada";
import { TituloSecao } from "@/components/ui/painel";
import { EditorComunicado } from "@/components/comunicados/editor-comunicado";
import { CompartilharWhatsApp } from "@/components/comunicados/compartilhar-whatsapp";
import { EtiquetasComunicado, EtiquetaStatusComunicado, TextoComunicado } from "@/components/comunicados/pecas";
import { GaleriaFotos } from "@/components/fotos/galeria";

export const metadata: Metadata = { title: "Comunicado" };

function Voltar() {
  return (
    <Link href="/admin/comunicados" className="flex min-h-11 w-fit items-center gap-1.5 font-bold text-lake">
      <ArrowLeft aria-hidden className="size-4" /> Comunicados
    </Link>
  );
}

export default async function ComunicadoGestao({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await exigirPermissao("comunicados.ver");
  const { id } = await params;
  if (!idDocumento.safeParse(id).success) notFound();

  // ----- Só consulta (ex.: conselho): vê o comunicado publicado, sem editar -----
  if (!ctx.permissoes.has("comunicados.publicar")) {
    const c = await obterPublicado(ctx, id);
    if (!c) notFound();
    return (
      <div className="flex max-w-3xl flex-col gap-6">
        <Voltar />
        <Cartao className={cx(c.prioridade === "urgente" && "border-danger")}>
          <article className="flex flex-col gap-3">
            <EtiquetasComunicado prioridade={c.prioridade} fixado={c.fixado} novo={ehNovo(c.publicadoEm)} />
            <h1 className="break-words text-[1.6rem] font-bold text-destaque">{c.titulo}</h1>
            {c.publicadoEm ? (
              <p className="text-[0.92rem] text-muted">Publicado em {formatarDataHora(c.publicadoEm, ctx.fuso)}</p>
            ) : null}
            <TextoComunicado texto={c.texto} />
            <GaleriaFotos fotos={c.fotos} titulo={c.titulo} variante="pagina" className="mt-2" />
          </article>
        </Cartao>
      </div>
    );
  }

  // ----- Síndico: situação, ações, compartilhar e edição -----
  const [c, base] = await Promise.all([obterParaGestao(ctx, id), enderecoDoPortal()]);
  if (!c) notFound();
  const campos = { id: c.id };
  const mensagem = mensagemWhatsApp(c, linkDoComunicado(base, c.id), ctx.condominioNome);

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <Voltar />
      <TituloPagina sobretitulo="Comunicação" titulo={c.titulo} />

      {/* Situação e ações rápidas */}
      <Cartao className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <EtiquetaStatusComunicado status={c.status} />
          <EtiquetasComunicado
            prioridade={c.prioridade}
            fixado={c.fixado && c.status === "publicado"}
            novo={c.status === "publicado" && ehNovo(c.publicadoEm)}
          />
        </div>
        <ul className="flex flex-col gap-1 text-[0.92rem] text-ink-2">
          {c.publicadoEm ? (
            <li className="flex items-center gap-1.5">
              <CalendarDays aria-hidden className="size-4 text-muted" />
              Publicado em {formatarDataHora(c.publicadoEm, ctx.fuso)}
            </li>
          ) : null}
          {c.atualizadoEm ? <li>Última alteração em {formatarDataHora(c.atualizadoEm, ctx.fuso)}</li> : null}
          {c.criadoPorNome ? <li>Escrito por {c.criadoPorNome}</li> : null}
        </ul>

        {c.status === "rascunho" ? (
          <Alerta tipo="aviso" titulo="Ainda não publicado">
            Os moradores só veem este comunicado depois de publicado.
          </Alerta>
        ) : c.status === "arquivado" ? (
          <Alerta tipo="info" titulo="Arquivado">
            Fora da lista dos moradores. O histórico fica guardado; dá para publicar de novo.
          </Alerta>
        ) : null}

        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          {c.status !== "publicado" ? (
            <AcaoConfirmada
              acao={mudarComunicado}
              campos={{ ...campos, mudanca: "publicar" }}
              variante="primario"
              titulo="Publicar este comunicado?"
              mensagem="Todos os moradores passam a ver o comunicado no portal."
              textoConfirmar="Publicar"
            >
              <Send aria-hidden className="size-5" /> Publicar
            </AcaoConfirmada>
          ) : null}
          {c.status === "publicado" && !c.fixado ? (
            <AcaoConfirmada
              acao={mudarComunicado}
              campos={{ ...campos, mudanca: "fixar" }}
              titulo="Fixar no topo?"
              mensagem="O comunicado fica no topo da lista e no Início dos moradores até você desafixar."
              textoConfirmar="Fixar"
            >
              <Pin aria-hidden className="size-5" /> Fixar no topo
            </AcaoConfirmada>
          ) : null}
          {c.fixado ? (
            <AcaoConfirmada
              acao={mudarComunicado}
              campos={{ ...campos, mudanca: "desafixar" }}
              titulo="Tirar do topo?"
              mensagem="O comunicado continua publicado, na ordem normal da lista."
              textoConfirmar="Desafixar"
            >
              <PinOff aria-hidden className="size-5" /> Desafixar
            </AcaoConfirmada>
          ) : null}
          {c.status !== "arquivado" ? (
            <AcaoConfirmada
              acao={mudarComunicado}
              campos={{ ...campos, mudanca: "arquivar" }}
              perigo
              titulo={c.status === "publicado" ? "Despublicar e arquivar?" : "Arquivar este rascunho?"}
              mensagem={
                c.status === "publicado"
                  ? "O comunicado sai da lista dos moradores. Nada é apagado: ele fica no histórico e pode ser publicado de novo."
                  : "O rascunho vai para os arquivados. Nada é apagado."
              }
              textoConfirmar="Arquivar"
            >
              <Archive aria-hidden className="size-5" /> {c.status === "publicado" ? "Despublicar (arquivar)" : "Arquivar"}
            </AcaoConfirmada>
          ) : null}
        </div>
      </Cartao>

      {/* Compartilhar (só publicado: o link precisa abrir para o morador) */}
      {c.status === "publicado" ? (
        <section aria-labelledby="titulo-compartilhar" className="flex flex-col gap-3">
          <TituloSecao id="titulo-compartilhar">Avisar no WhatsApp</TituloSecao>
          <Cartao className="flex flex-col gap-3">
            <p className="text-ink-2">
              Texto pronto para o grupo do Residencial Jardins do Lago. O morador entra no portal com o usuário e a senha dele para ler o
              comunicado completo.
            </p>
            <CompartilharWhatsApp mensagem={mensagem} />
          </Cartao>
        </section>
      ) : null}

      {/* Edição */}
      <section aria-labelledby="titulo-editar" className="flex flex-col gap-3">
        <TituloSecao id="titulo-editar">Editar</TituloSecao>
        <Cartao>
          <EditorComunicado
            comunicado={{
              id: c.id,
              titulo: c.titulo,
              texto: c.texto,
              prioridade: c.prioridade,
              fixado: c.fixado,
              status: c.status,
              fotos: c.fotos,
            }}
          />
        </Cartao>
      </section>
    </div>
  );
}
