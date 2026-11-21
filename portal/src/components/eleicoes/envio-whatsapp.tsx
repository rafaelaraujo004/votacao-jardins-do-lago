"use client";

/**
 * Botões da comissão para enviar o LINK DE VOTO de uma casa pelo WhatsApp, em dois passos:
 * 1. Mensagem: o link wa.me abre a conversa da casa já com o texto (sem precisar ter o
 *    contato salvo). O WhatsApp só abre uma conversa por vez: o botão abre o 1º contato e,
 *    no próximo toque, o 2º (e o 3º). Cada abertura fica anotada (para saber quem já recebeu).
 * 2. Imagens: o wa.me não anexa imagens, então o passo a passo vai pelo "Compartilhar" do
 *    celular — a conversa recém-aberta aparece primeiro na lista do WhatsApp. Se o celular
 *    recusar as 9 imagens, vai sozinho o PDF; o botão "ou PDF" manda o PDF direto (1 arquivo).
 * Também dá para:
 * - copiar o link, ou a MENSAGEM INTEIRA (link, senha e passos) para colar onde quiser;
 * - mandar para OUTRO NÚMERO (o morador pediu no número do filho, ou a casa está sem telefone
 *   na lista): o número digitado é lido só pelos dígitos, com DDD obrigatório (nunca completado sozinho)
 *   — o link e a senha não podem ir para o número errado. O envio fica anotado como no botão 1.
 */
import { useId, useRef, useState, useTransition, type FormEvent } from "react";
import {
  Check,
  ChevronDown,
  CircleAlert,
  Copy,
  MessageCircle,
  Phone,
} from "lucide-react";
import { marcarEnvioWhatsApp } from "@/server/acoes/votacao-links";
import { formatarTelefone } from "@/lib/contatos-votacao";
import { classeEntrada } from "@/components/ui/basicos";
import { useAvisos } from "@/components/ui/avisos";
import { EnviarImagensGuia } from "@/components/eleicoes/enviar-imagens-guia";
import { cx } from "@/lib/cx";

const EXEMPLO = "(94) 99123-4567";

/**
 * Lê o número digitado em "Outro número" e devolve no formato do wa.me (55DDNNNNNNNNN).
 * Exige o DDD: sem ele (ou com o número pela metade) não dá para ter certeza de quem recebe.
 */
function lerOutroNumero(
  texto: string,
): { ok: true; tel: string } | { ok: false; erro: string } {
  // Só os dígitos, do jeito que foram digitados: o DDD NUNCA é completado sozinho (um número
  // pela metade não pode virar outro número válido e receber o link e a senha da casa).
  const digitos = texto.replace(/\D/g, "");
  if (digitos.length < 10)
    return {
      ok: false,
      erro: `Número incompleto ou sem DDD. Exemplo: ${EXEMPLO}.`,
    };
  const nacional =
    (digitos.length === 12 || digitos.length === 13) && digitos.startsWith("55") ? digitos.slice(2) : digitos;
  if (nacional.length !== 10 && nacional.length !== 11)
    return { ok: false, erro: `Digite um número só, com DDD. Exemplo: ${EXEMPLO}.` };
  const tel = `55${nacional}`;
  // DDD de 11 a 99 e celular (11 dígitos) começando com 9.
  if (!/^55[1-9][1-9]\d{8,9}$/.test(tel) || (nacional.length === 11 && nacional[2] !== "9"))
    return {
      ok: false,
      erro: `Não reconheci este número. Exemplo: ${EXEMPLO}.`,
    };
  return { ok: true, tel };
}

const classeBotaoTexto =
  "inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 text-[0.88rem] font-bold text-lake hover:shadow-afundado";
const classeBotaoVerde =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-[#1f8f4e] px-4 text-[0.92rem] font-bold text-white shadow-relevo transition-shadow active:shadow-afundado disabled:cursor-not-allowed disabled:opacity-50";

export function EnvioWhatsApp({
  eleicaoId,
  unitId,
  telefones,
  link,
  mensagem,
  enviado,
}: {
  eleicaoId: string;
  unitId: string;
  telefones: string[];
  link: string;
  mensagem: string;
  enviado: boolean;
}) {
  const [proximo, setProximo] = useState(0);
  const [copiado, setCopiado] = useState<"link" | "mensagem" | null>(null);
  // Casa sem telefone na lista: "Outro número" já começa aberto.
  const [outroAberto, setOutroAberto] = useState(!telefones.length);
  const [outro, setOutro] = useState("");
  const [erroOutro, setErroOutro] = useState<string | null>(null);
  const [mandouOutro, setMandouOutro] = useState(false);
  const campoOutro = useRef<HTMLInputElement>(null);
  const idOutro = useId();
  const [, iniciar] = useTransition();
  const { avisar } = useAvisos();
  const todos = proximo >= telefones.length;
  const indice = todos ? 0 : proximo;
  const previa = outro.trim() ? lerOutroNumero(outro) : null;

  /** Abre a conversa do WhatsApp com a mensagem e anota o envio da casa. */
  function abrirConversa(tel: string) {
    window.open(
      `https://wa.me/${tel}?text=${encodeURIComponent(mensagem)}`,
      "_blank",
      "noopener,noreferrer",
    );
    iniciar(async () => {
      const r = await marcarEnvioWhatsApp(eleicaoId, unitId);
      if (r && !r.ok) avisar("erro", r.erro);
    });
  }

  function abrir() {
    abrirConversa(telefones[indice]);
    setProximo(todos ? 1 : proximo + 1);
  }

  function mandarOutro(ev: FormEvent<HTMLFormElement>) {
    ev.preventDefault();
    const r = lerOutroNumero(outro);
    if (!r.ok) {
      setErroOutro(r.erro);
      campoOutro.current?.focus();
      return;
    }
    setErroOutro(null);
    setMandouOutro(true);
    abrirConversa(r.tel);
  }

  function alternarOutro() {
    const abrindo = !outroAberto;
    setOutroAberto(abrindo);
    // Quem tocou para abrir quer digitar: já põe o cursor no campo.
    if (abrindo) setTimeout(() => campoOutro.current?.focus(), 0);
  }

  async function copiar(qual: "link" | "mensagem") {
    try {
      await navigator.clipboard.writeText(qual === "link" ? link : mensagem);
      setCopiado(qual);
      setTimeout(() => setCopiado((c) => (c === qual ? null : c)), 2000);
    } catch {
      avisar(
        "erro",
        qual === "link"
          ? "Não deu para copiar. Segure o dedo no link para copiar."
          : "Não deu para copiar. Use o botão 1 ou “Outro número” para abrir o WhatsApp com a mensagem.",
      );
    }
  }

  const rotulo = !telefones.length
    ? "1. Sem telefone"
    : todos && proximo > 0
      ? "1. Mensagem de novo"
      : telefones.length === 1
        ? "1. Mensagem"
        : `1. Mensagem · ${indice + 1}º contato`;

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={abrir}
          disabled={!telefones.length}
          className={classeBotaoVerde}
          title={
            telefones[indice] ? formatarTelefone(telefones[indice]) : undefined
          }
        >
          <MessageCircle aria-hidden className="size-4" />
          {rotulo}
          {telefones.length > 1 && !(todos && proximo > 0) ? (
            <span className="rounded-full bg-white/20 px-1.5 text-[0.75rem]">
              {Math.min(proximo, telefones.length)}/{telefones.length}
            </span>
          ) : null}
        </button>
        <EnviarImagensGuia rotulo="2. Imagens" variante="compacto" />
        <EnviarImagensGuia
          formato="pdf"
          rotulo="ou PDF"
          descricao="o passo a passo em 1 arquivo"
          variante="mini"
        />
      </div>
      <p className="text-[0.82rem] leading-snug text-muted">
        {telefones.length
          ? "Depois da mensagem, toque em 2 (ou em “ou PDF”) e escolha a mesma conversa — ela aparece primeiro na lista."
          : "Sem telefone na lista: digite um número em “Outro número” (ou copie a mensagem). Depois toque em 2 (ou em “ou PDF”) e escolha a mesma conversa."}
      </p>
      <div className="flex flex-wrap items-center gap-x-1 gap-y-1">
        <button
          type="button"
          onClick={() => copiar("link")}
          className={classeBotaoTexto}
        >
          {copiado === "link" ? (
            <Check aria-hidden className="size-4" />
          ) : (
            <Copy aria-hidden className="size-4" />
          )}
          {copiado === "link" ? "Link copiado" : "Copiar link"}
        </button>
        <button
          type="button"
          onClick={() => copiar("mensagem")}
          className={classeBotaoTexto}
        >
          {copiado === "mensagem" ? (
            <Check aria-hidden className="size-4" />
          ) : (
            <Copy aria-hidden className="size-4" />
          )}
          {copiado === "mensagem" ? "Mensagem copiada" : "Copiar mensagem"}
        </button>
        <button
          type="button"
          onClick={alternarOutro}
          aria-expanded={outroAberto}
          aria-controls={idOutro}
          className={classeBotaoTexto}
        >
          <Phone aria-hidden className="size-4" />
          Outro número
          <ChevronDown
            aria-hidden
            className={cx(
              "size-4 transition-transform",
              outroAberto && "rotate-180",
            )}
          />
        </button>
        {enviado || proximo > 0 || mandouOutro ? (
          <span className="inline-flex items-center gap-1 px-1 text-[0.8rem] font-bold text-pine">
            <Check aria-hidden className="size-3.5" /> enviado
          </span>
        ) : null}
      </div>
      {outroAberto ? (
        <form
          id={idOutro}
          onSubmit={mandarOutro}
          noValidate
          className="flex flex-col gap-2 rounded-2xl bg-surface-2 p-3"
        >
          <label
            htmlFor={`${idOutro}-numero`}
            className="text-[0.9rem] font-bold text-ink"
          >
            Mandar para outro número (com DDD)
          </label>
          <div className="flex flex-col gap-2 min-[440px]:flex-row">
            <input
              ref={campoOutro}
              id={`${idOutro}-numero`}
              type="tel"
              inputMode="tel"
              autoComplete="off"
              maxLength={30}
              value={outro}
              onChange={(e) => {
                setOutro(e.target.value);
                setErroOutro(null);
              }}
              placeholder={EXEMPLO}
              aria-invalid={erroOutro ? true : undefined}
              aria-describedby={`${idOutro}-ajuda`}
              className={cx(classeEntrada, "min-w-0 min-[440px]:flex-1")}
            />
            <button type="submit" className={cx(classeBotaoVerde, "shrink-0")}>
              <MessageCircle aria-hidden className="size-4" />
              Abrir WhatsApp
            </button>
          </div>
          <p
            id={`${idOutro}-ajuda`}
            aria-live="polite"
            className={cx(
              "flex items-start gap-1.5 text-[0.85rem] leading-snug",
              erroOutro ? "font-bold text-danger" : "text-muted",
            )}
          >
            {erroOutro ? (
              <>
                <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
                {erroOutro}
              </>
            ) : previa?.ok ? (
              <>
                <Check
                  aria-hidden
                  className="mt-0.5 size-4 shrink-0 text-pine"
                />
                <span>
                  Vai abrir a conversa com{" "}
                  <b className="text-ink">{formatarTelefone(previa.tel)}</b>,
                  já com a mensagem desta casa.
                </span>
              </>
            ) : (
              `Exemplo: ${EXEMPLO}. A mensagem desta casa vai junto.`
            )}
          </p>
        </form>
      ) : null}
    </div>
  );
}
