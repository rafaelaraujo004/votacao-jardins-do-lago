"use client";

/**
 * Formulário de criar/editar comunicado, com pré-visualização
 * ("como o morador vai ver") antes de publicar.
 */
import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useFormStatus } from "react-dom";
import { Eye, PenLine, Save, Send } from "lucide-react";
import { Alerta, Campo, Cartao, classeEntrada } from "@/components/ui/basicos";
import { Botao } from "@/components/ui/botao";
import { Formulario } from "@/components/ui/formulario";
import { salvarComunicado } from "@/server/acoes/comunicados";
import { LIMITE_TEXTO, LIMITE_TITULO, limparTexto, limparTitulo, type Prioridade, type StatusComunicado } from "@/lib/comunicados";
import { cx } from "@/lib/cx";
import { EtiquetasComunicado, TextoComunicado } from "./pecas";

export type ComunicadoEditavel = {
  id: string;
  titulo: string;
  texto: string;
  prioridade: Prioridade;
  fixado: boolean;
  status: StatusComunicado;
};

/** Botão de enviar que diz o destino (salvar ou publicar) e mostra o carregamento. */
function BotaoDestino({
  destino,
  icone,
  children,
  variante,
}: {
  destino: "salvar" | "publicar";
  icone: ReactNode;
  children: ReactNode;
  variante: "primario" | "secundario";
}) {
  const { pending } = useFormStatus();
  return (
    <Botao type="submit" name="destino" value={destino} variante={variante} carregando={pending} icone={icone}>
      {pending ? "Salvando…" : children}
    </Botao>
  );
}

export function EditorComunicado({ comunicado }: { comunicado: ComunicadoEditavel | null }) {
  const router = useRouter();
  const [titulo, setTitulo] = useState(comunicado?.titulo ?? "");
  const [texto, setTexto] = useState(comunicado?.texto ?? "");
  const [prioridade, setPrioridade] = useState<Prioridade>(comunicado?.prioridade ?? "normal");
  const [fixado, setFixado] = useState(comunicado?.fixado ?? false);
  const [vendo, setVendo] = useState<"escrever" | "previa">("escrever");

  const publicado = comunicado?.status === "publicado";
  const tituloLimpo = limparTitulo(titulo);
  const textoLimpo = limparTexto(texto);

  return (
    <Formulario
      acao={salvarComunicado}
      limparAoSalvar={false}
      aoSalvar={() => {
        if (comunicado) router.refresh();
        else router.push("/admin/comunicados");
      }}
    >
      {comunicado ? <input type="hidden" name="id" value={comunicado.id} /> : null}

      {/* Escrever / Pré-visualizar */}
      <div role="group" aria-label="Modo do editor" className="afundado inline-flex gap-1 self-start rounded-full p-[5px]">
        {(
          [
            { valor: "escrever", rotulo: "Escrever", icone: PenLine },
            { valor: "previa", rotulo: "Pré-visualizar", icone: Eye },
          ] as const
        ).map((o) => (
          <button
            key={o.valor}
            type="button"
            aria-pressed={vendo === o.valor}
            onClick={() => setVendo(o.valor)}
            className={cx(
              "inline-flex min-h-11 items-center gap-1.5 rounded-full px-4 text-[0.92rem] font-bold",
              vendo === o.valor ? "saltado text-destaque" : "text-muted hover:text-ink",
            )}
          >
            <o.icone aria-hidden className="size-4" />
            {o.rotulo}
          </button>
        ))}
      </div>

      {/* Os campos ficam no formulário mesmo escondidos: assim "Publicar" funciona dos dois modos.
          (Sem "required" no navegador: o servidor confere e explica o que falta.) */}
      <div className={cx("flex flex-col gap-4", vendo !== "escrever" && "hidden")}>
        <Campo id="titulo" rotulo="Título" dica="Curto e direto. Ex.: Falta de água na quinta-feira">
          <input
            id="titulo"
            name="titulo"
            maxLength={LIMITE_TITULO}
            value={titulo}
            onChange={(e) => setTitulo(e.target.value)}
            className={classeEntrada}
            aria-describedby="titulo-dica"
          />
        </Campo>

        <Campo
          id="texto"
          rotulo="Texto"
          dica="Texto simples. Deixe uma linha em branco para começar outro parágrafo."
        >
          <textarea
            id="texto"
            name="texto"
            rows={10}
            maxLength={LIMITE_TEXTO}
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            className={`${classeEntrada} py-3 leading-relaxed`}
            aria-describedby="texto-dica texto-contador"
          />
          <p id="texto-contador" className="self-end text-[0.84rem] text-muted">
            {texto.length.toLocaleString("pt-BR")} de {LIMITE_TEXTO.toLocaleString("pt-BR")} caracteres
          </p>
        </Campo>

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1.5 font-bold">Prioridade</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {(
              [
                { valor: "normal", rotulo: "Normal", dica: "Aviso do dia a dia." },
                { valor: "urgente", rotulo: "Urgente", dica: "Aparece em destaque, no topo." },
              ] as const
            ).map((o) => (
              <label
                key={o.valor}
                className={cx(
                  "flex min-h-14 cursor-pointer items-start gap-3 rounded-2xl border-2 px-4 py-3",
                  prioridade === o.valor ? (o.valor === "urgente" ? "border-danger bg-danger-soft" : "border-pine bg-ok-soft") : "border-line",
                )}
              >
                <input
                  type="radio"
                  name="prioridade"
                  value={o.valor}
                  checked={prioridade === o.valor}
                  onChange={() => setPrioridade(o.valor)}
                  className="mt-1 size-5 accent-[var(--pine)]"
                />
                <span>
                  <b className="block">{o.rotulo}</b>
                  <span className="text-[0.9rem] text-ink-2">{o.dica}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <label className="flex min-h-12 cursor-pointer items-start gap-3 rounded-2xl border-2 border-line px-4 py-3">
          <input
            type="checkbox"
            name="fixado"
            checked={fixado}
            onChange={(e) => setFixado(e.target.checked)}
            className="mt-1 size-5 accent-[var(--pine)]"
          />
          <span>
            <b className="block">Fixar no topo da lista</b>
            <span className="text-[0.9rem] text-ink-2">Vale quando o comunicado estiver publicado.</span>
          </span>
        </label>
      </div>

      {vendo === "previa" ? (
        <div className="flex flex-col gap-3">
          <p className="text-[0.92rem] text-muted">Assim o morador vai ver o comunicado:</p>
          <Cartao className={cx(prioridade === "urgente" && "border-danger")}>
            <article className="flex flex-col gap-3">
              <EtiquetasComunicado prioridade={prioridade} fixado={fixado} novo={!publicado} />
              <h2 className="break-words text-[1.4rem] font-bold text-destaque">{tituloLimpo || "Sem título"}</h2>
              <TextoComunicado texto={textoLimpo} />
            </article>
          </Cartao>
          {tituloLimpo.length < 3 || textoLimpo.length < 3 ? (
            <Alerta tipo="aviso" titulo="Falta preencher">
              Escreva o título e o texto antes de publicar.
            </Alerta>
          ) : null}
        </div>
      ) : null}

      <div className="flex flex-col-reverse gap-2 border-t border-line pt-4 sm:flex-row sm:justify-end">
        {publicado ? (
          <BotaoDestino destino="salvar" variante="primario" icone={<Save aria-hidden className="size-5" />}>
            Salvar alterações
          </BotaoDestino>
        ) : (
          <>
            <BotaoDestino destino="salvar" variante="secundario" icone={<Save aria-hidden className="size-5" />}>
              {comunicado ? "Salvar sem publicar" : "Salvar rascunho"}
            </BotaoDestino>
            <BotaoDestino destino="publicar" variante="primario" icone={<Send aria-hidden className="size-5" />}>
              Publicar agora
            </BotaoDestino>
          </>
        )}
      </div>
      {publicado ? (
        <p className="text-[0.9rem] text-muted">
          Este comunicado já está publicado: ao salvar, os moradores passam a ver a versão nova.
        </p>
      ) : null}
    </Formulario>
  );
}
