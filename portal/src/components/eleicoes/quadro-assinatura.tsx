"use client";

/**
 * QUADRO DE ASSINATURA da ata da votação (assinar com o dedo, como no berçário Pingo de Gente).
 *
 * - FormularioAssinatura: campo "Nome completo" + quadro branco (papel) para assinar com o dedo,
 *   caneta ou mouse, com "Apagar" e "Confirmar". Ao confirmar, a assinatura é reduzida para no
 *   máximo 600 px de largura (PNG) e enviada para a ação do servidor.
 * - JanelaAssinatura: o mesmo formulário numa janela (<dialog>): Esc fecha, o foco vai para o nome.
 * - AcoesVagaAta: na ata da comissão, os botões de uma vaga em branco: "Assinar aqui" (abre a
 *   janela no próprio aparelho) e "Mandar link pelo WhatsApp" / "Copiar link".
 * - AssinaturaPorLink: a página pública do link (o formulário aberto, sem janela).
 *
 * O quadro é branco nos dois temas (é o papel) e a tinta é azul escura, como caneta. O traço é
 * guardado ponto a ponto: se a tela mudar de tamanho, o desenho é refeito sem se perder.
 * Sem animações (nada a reduzir para quem pede menos movimento).
 */
import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { CircleCheck, Copy, Eraser, MessageCircle, PenLine, X } from "lucide-react";
import { Botao } from "@/components/ui/botao";
import { classeEntrada } from "@/components/ui/basicos";
import { BotaoComConfirmacao } from "@/components/ui/confirmacao";
import { useAvisos } from "@/components/ui/avisos";
import type { ResultadoAcao } from "@/components/ui/formulario";
import { assinarAtaNoAparelho, gerarLinkAssinaturaAta } from "@/server/acoes/assinaturas-ata";
import {
  LARGURA_MAX_ASSINATURA,
  MAX_IMAGEM_ASSINATURA,
  MAX_NOME_ASSINATURA,
  mensagemLinkAssinatura,
  validarNomeCompleto,
} from "@/lib/assinaturas-ata";
import { cx } from "@/lib/cx";

type Acao = (anterior: ResultadoAcao, dados: FormData) => Promise<ResultadoAcao>;
type Ponto = { x: number; y: number };

const TINTA = "#1f3a8a";
const ESPESSURA = 3;

function pintarTraco(g: CanvasRenderingContext2D, t: Ponto[]) {
  if (!t.length) return;
  if (t.length === 1) {
    g.beginPath();
    g.arc(t[0].x, t[0].y, ESPESSURA / 2, 0, Math.PI * 2);
    g.fill();
    return;
  }
  g.beginPath();
  g.moveTo(t[0].x, t[0].y);
  for (let i = 1; i < t.length; i++) g.lineTo(t[i].x, t[i].y);
  g.stroke();
}

/** Limpa e refaz o desenho inteiro (depois de mudar o tamanho ou de apagar). */
function redesenhar(c: HTMLCanvasElement, tracos: Ponto[][], dpr: number) {
  const g = c.getContext("2d");
  if (!g) return;
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.clearRect(0, 0, c.width, c.height);
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.lineWidth = ESPESSURA;
  g.lineCap = "round";
  g.lineJoin = "round";
  g.strokeStyle = TINTA;
  g.fillStyle = TINTA;
  for (const t of tracos) pintarTraco(g, t);
}

/** PNG da assinatura com no máximo 600 px de largura (fundo transparente: só a tinta). */
function exportarPng(c: HTMLCanvasElement): string {
  const largura = Math.min(LARGURA_MAX_ASSINATURA, c.width);
  const altura = Math.max(1, Math.round((c.height * largura) / c.width));
  const saida = document.createElement("canvas");
  saida.width = largura;
  saida.height = altura;
  const g = saida.getContext("2d");
  if (!g) return "";
  g.imageSmoothingQuality = "high";
  g.drawImage(c, 0, 0, largura, altura);
  return saida.toDataURL("image/png");
}

// ---------- Formulário: nome + quadro ----------

export function FormularioAssinatura({
  papel,
  acao,
  campos,
  ativo,
  focarNome = false,
  aviso,
  aoAssinar,
}: {
  /** Quem assina (ex.: "Testemunha"). */
  papel: string;
  acao: Acao;
  /** Campos fixos enviados junto (ex.: id da votação e vaga, ou o código do link). */
  campos: Record<string, string>;
  /** O quadro está visível (ex.: a janela abriu): mede o tamanho do quadro. */
  ativo: boolean;
  /** Põe o foco no nome ao aparecer (na janela). Na página do link, não: o teclado cobriria o resultado. */
  focarNome?: boolean;
  aviso?: ReactNode;
  aoAssinar: (mensagem: string) => void;
}) {
  const id = useId();
  const canvas = useRef<HTMLCanvasElement>(null);
  const entradaNome = useRef<HTMLInputElement>(null);
  const tracos = useRef<Ponto[][]>([]);
  const riscando = useRef<number | null>(null);
  // 0 = quadro ainda não preparado (a primeira medida sempre ajusta tamanho, traço e cor).
  const dpr = useRef(0);
  const [nome, setNome] = useState("");
  const [temTraco, setTemTraco] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  // Tamanho real do quadro × densidade da tela (até 2): traço fino e nítido no celular.
  const preparar = useCallback(() => {
    const c = canvas.current;
    if (!c) return;
    const r = c.getBoundingClientRect();
    if (r.width < 10 || r.height < 10) return;
    const d = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.round(r.width * d);
    const h = Math.round(r.height * d);
    if (c.width === w && c.height === h && dpr.current === d) return;
    c.width = w;
    c.height = h;
    dpr.current = d;
    redesenhar(c, tracos.current, d);
  }, []);

  useEffect(() => {
    if (!ativo) return;
    preparar();
    if (focarNome) entradaNome.current?.focus();
    const c = canvas.current;
    if (!c || typeof ResizeObserver === "undefined") return;
    const obs = new ResizeObserver(() => preparar());
    obs.observe(c);
    return () => obs.disconnect();
  }, [ativo, focarNome, preparar]);

  function ponto(e: React.PointerEvent<HTMLCanvasElement> | PointerEvent): Ponto {
    const r = canvas.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  function comecar(e: React.PointerEvent<HTMLCanvasElement>) {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    const c = canvas.current;
    const g = c?.getContext("2d");
    if (!c || !g) return;
    e.preventDefault();
    preparar();
    c.setPointerCapture?.(e.pointerId);
    riscando.current = e.pointerId;
    const p = ponto(e);
    tracos.current.push([p]);
    pintarTraco(g, [p]);
    setTemTraco(true);
    setErro(null);
  }

  function riscar(e: React.PointerEvent<HTMLCanvasElement>) {
    if (riscando.current !== e.pointerId) return;
    const g = canvas.current?.getContext("2d");
    const atual = tracos.current[tracos.current.length - 1];
    if (!g || !atual) return;
    // Pontos intermediários que o navegador juntou num evento só: traço mais liso.
    const eventos = e.nativeEvent.getCoalescedEvents?.() ?? [];
    const novos = (eventos.length ? eventos : [e.nativeEvent]).map(ponto);
    const anterior = atual[atual.length - 1];
    atual.push(...novos);
    pintarTraco(g, [anterior, ...novos]);
  }

  function parar(e: React.PointerEvent<HTMLCanvasElement>) {
    if (riscando.current === e.pointerId) riscando.current = null;
  }

  function apagar() {
    tracos.current = [];
    if (canvas.current) redesenhar(canvas.current, [], dpr.current || 1);
    setTemTraco(false);
  }

  const nomeOk = validarNomeCompleto(nome);
  const pode = temTraco && nomeOk.ok && !enviando;
  // Botão desativado sempre diz o porquê (quem usa pode não perceber o que falta).
  const falta = !nomeOk.ok
    ? nome.trim()
      ? nomeOk.erro
      : temTraco
        ? "Para confirmar, escreva o seu nome completo."
        : "Para confirmar, escreva o nome completo e assine no quadro."
    : !temTraco
      ? "Para confirmar, assine no quadro com o dedo."
      : null;

  async function confirmar() {
    const c = canvas.current;
    const n = validarNomeCompleto(nome);
    if (!c || !temTraco) return setErro("Passe o dedo dentro do quadro para assinar.");
    if (!n.ok) return setErro(n.erro);
    const imagem = exportarPng(c);
    if (!imagem || imagem.length > MAX_IMAGEM_ASSINATURA)
      return setErro("A assinatura ficou grande demais. Apague e assine de novo.");
    setEnviando(true);
    setErro(null);
    const dados = new FormData();
    for (const [k, v] of Object.entries(campos)) dados.set(k, v);
    dados.set("nome", n.nome);
    dados.set("imagem", imagem);
    try {
      const r = await acao(null, dados);
      if (r?.ok) aoAssinar(r.mensagem);
      else setErro(r?.erro ?? "Não foi possível registrar a assinatura. Tente de novo.");
    } catch {
      // Sem internet, ou o site foi atualizado com a página aberta.
      setErro("Não deu para confirmar se a assinatura foi registrada. Confira a internet e atualize a página para ver como ficou.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${id}-nome`} className="font-bold">
          Nome completo
        </label>
        <p id={`${id}-dica`} className="text-[0.92rem] text-muted">
          Nome e sobrenome de quem assina como <b className="text-ink-2">{papel}</b>.
        </p>
        <input
          ref={entradaNome}
          id={`${id}-nome`}
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          autoComplete="name"
          autoCapitalize="words"
          enterKeyHint="done"
          maxLength={MAX_NOME_ASSINATURA}
          aria-describedby={`${id}-dica`}
          className={classeEntrada}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <p id={`${id}-quadro`} className="font-bold">
          Passe o dedo dentro do quadro para assinar.
        </p>
        {/* Papel branco nos dois temas; a linha tracejada é só um guia (não sai na imagem). */}
        <div className="relative h-[180px] overflow-hidden rounded-2xl border-2 border-[#9aa6a0] bg-white">
          <span
            aria-hidden
            className="pointer-events-none absolute inset-x-5 bottom-[26%] border-b-2 border-dashed border-[#b7c0bb]"
          />
          <span aria-hidden className="pointer-events-none absolute bottom-[27%] left-5 text-[1.1rem] font-bold text-[#9aa6a0]">
            ✕
          </span>
          <canvas
            ref={canvas}
            aria-labelledby={`${id}-quadro`}
            className="absolute inset-0 size-full cursor-crosshair touch-none select-none"
            onPointerDown={comecar}
            onPointerMove={riscar}
            onPointerUp={parar}
            onPointerCancel={parar}
            onLostPointerCapture={parar}
          />
        </div>
      </div>

      {aviso ? <div className="text-[0.92rem] text-ink-2">{aviso}</div> : null}

      {erro ? (
        <p role="alert" className="rounded-2xl bg-danger-soft px-4 py-3 font-bold text-danger">
          {erro}
        </p>
      ) : null}

      <div className="grid grid-cols-2 gap-2">
        <Botao
          variante="secundario"
          onClick={apagar}
          disabled={!temTraco || enviando}
          icone={<Eraser aria-hidden className="size-5" />}
        >
          Apagar
        </Botao>
        <Botao
          onClick={confirmar}
          disabled={!pode}
          carregando={enviando}
          icone={<PenLine aria-hidden className="size-5" />}
        >
          {enviando ? "Enviando…" : "Confirmar"}
        </Botao>
      </div>
      {falta && !enviando ? (
        <p className="-mt-2 text-center text-[0.88rem] text-muted" aria-live="polite">
          {falta}
        </p>
      ) : null}
    </div>
  );
}

// ---------- Janela (no aparelho da comissão) ----------

/** Classes dos botões que ficam DENTRO da ata (a ata é sempre clara, como papel). */
const botaoAta =
  "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-full border px-4 text-[0.92rem] font-bold leading-tight disabled:cursor-not-allowed disabled:opacity-50";
const botaoAtaCheio = cx(botaoAta, "border-transparent bg-[#1d6b4e] text-white hover:bg-[#185b42]");
const botaoAtaContorno = cx(botaoAta, "border-[#c3cbc6] bg-white text-[#1d6b4e] hover:border-[#1d6b4e]");

export function JanelaAssinatura({
  papel,
  acao,
  campos,
  rotulo = "Assinar aqui",
}: {
  papel: string;
  acao: Acao;
  campos: Record<string, string>;
  rotulo?: string;
}) {
  const janela = useRef<HTMLDialogElement>(null);
  const idTitulo = useId();
  const [aberto, setAberto] = useState(false);
  // Cada abertura começa um formulário novo (nome e quadro em branco).
  const [vez, setVez] = useState(0);
  const { avisar } = useAvisos();

  function abrir() {
    setVez((v) => v + 1);
    setAberto(true);
    janela.current?.showModal();
  }

  return (
    <>
      <button type="button" onClick={abrir} className={botaoAtaCheio}>
        <PenLine aria-hidden className="size-4" /> {rotulo}
      </button>
      <dialog
        ref={janela}
        aria-labelledby={idTitulo}
        onClose={() => setAberto(false)}
        className="m-auto max-h-[94dvh] w-[min(94vw,34rem)] overflow-y-auto rounded-[26px] border border-borda-luz bg-surface p-0 text-left text-ink shadow-float backdrop:bg-black/50"
      >
        <div className="flex flex-col gap-4 p-5 sm:p-6">
          <div className="flex items-start justify-between gap-3">
            <h2 id={idTitulo} className="text-xl font-bold">
              Assinar a ata — {papel}
            </h2>
            <Botao
              variante="discreto"
              tamanho="pequeno"
              onClick={() => janela.current?.close()}
              icone={<X aria-hidden className="size-5" />}
            >
              Fechar
            </Botao>
          </div>
          {aberto ? (
            <FormularioAssinatura
              key={vez}
              papel={papel}
              acao={acao}
              campos={campos}
              ativo={aberto}
              focarNome
              aviso="Quem assina declara que conferiu o resultado desta ata. Ficam registrados data, hora e aparelho."
              aoAssinar={(mensagem) => {
                avisar("sucesso", mensagem);
                janela.current?.close();
              }}
            />
          ) : null}
        </div>
      </dialog>
    </>
  );
}

// ---------- Botões de uma vaga em branco na ata ----------

const enderecoWhatsApp = (titulo: string, papel: string, link: string) =>
  `https://wa.me/?text=${encodeURIComponent(mensagemLinkAssinatura(titulo, papel, link))}`;

export function AcoesVagaAta({
  eleicaoId,
  vaga,
  papel,
  titulo,
  linkAtual,
  linkCriadoEm,
}: {
  eleicaoId: string;
  vaga: string;
  papel: string;
  /** Título da votação (vai na mensagem do WhatsApp). */
  titulo: string;
  /** Link que ainda está valendo para esta vaga (endereço completo), se houver. */
  linkAtual: string | null;
  /** "21/11/2026 às 17:10" */
  linkCriadoEm: string | null;
}) {
  const { avisar } = useAvisos();
  const [linkNovo, setLinkNovo] = useState<string | null>(null);
  const [gerando, setGerando] = useState(false);
  const [copiado, setCopiado] = useState(false);
  const link = linkNovo ?? linkAtual;

  async function copiar(texto: string): Promise<boolean> {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
      return true;
    } catch {
      return false;
    }
  }

  /** Cria (ou troca) o link no servidor. Devolve o endereço, ou null se deu erro (já avisado). */
  async function gerar(): Promise<string | null> {
    setGerando(true);
    try {
      const r = await gerarLinkAssinaturaAta(eleicaoId, vaga);
      if (!r.ok) {
        avisar("erro", r.erro);
        return null;
      }
      setLinkNovo(r.link);
      avisar("sucesso", r.mensagem);
      return r.link;
    } catch {
      avisar("erro", "Não deu para criar o link. Confira a internet e tente de novo.");
      return null;
    } finally {
      setGerando(false);
    }
  }

  async function gerarEMandar() {
    // A aba do WhatsApp é aberta ANTES de esperar o servidor: o celular bloqueia janelas
    // abertas depois de uma espera. Se não abrir, o link fica na tela com o botão do WhatsApp.
    const aba = window.open("", "_blank");
    const novo = await gerar();
    if (!novo) {
      aba?.close();
      return;
    }
    if (aba) {
      aba.opener = null;
      aba.location.href = enderecoWhatsApp(titulo, papel, novo);
    }
  }

  async function gerarECopiar() {
    const novo = await gerar();
    if (novo && !(await copiar(novo)))
      avisar("info", "Link pronto. Toque em “Copiar link” para copiar.");
  }

  if (!link) {
    return (
      <div className="flex flex-wrap justify-center gap-2">
        <JanelaAssinatura papel={papel} acao={assinarAtaNoAparelho} campos={{ id: eleicaoId, vaga }} />
        <button type="button" onClick={gerarEMandar} disabled={gerando} className={botaoAtaContorno} aria-busy={gerando || undefined}>
          <MessageCircle aria-hidden className="size-4" /> {gerando ? "Criando o link…" : "Mandar link pelo WhatsApp"}
        </button>
        <button type="button" onClick={gerarECopiar} disabled={gerando} className={botaoAtaContorno}>
          <Copy aria-hidden className="size-4" /> Copiar link
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap justify-center gap-2">
        <JanelaAssinatura papel={papel} acao={assinarAtaNoAparelho} campos={{ id: eleicaoId, vaga }} />
      </div>
      <div className="flex flex-col gap-2 rounded-2xl border border-[#c3cbc6] bg-[#f6f8f7] p-3 text-left text-[0.88rem] text-[#3d4e45]">
        <p>
          <b className="text-[#14211b]">Link para assinar já criado</b>
          {linkCriadoEm && !linkNovo ? ` em ${linkCriadoEm}` : ""}. Ainda não foi usado; vale uma vez.
        </p>
        <p className="break-all font-mono text-[0.8rem] text-[#14211b]">{link}</p>
        <div className="flex flex-wrap gap-2">
          <a
            href={enderecoWhatsApp(titulo, papel, link)}
            target="_blank"
            rel="noopener noreferrer"
            className={botaoAtaCheio}
          >
            <MessageCircle aria-hidden className="size-4" /> Mandar pelo WhatsApp
          </a>
          <button
            type="button"
            onClick={async () => {
              if (!(await copiar(link))) avisar("erro", "Não deu para copiar. Segure o dedo no link para copiar.");
            }}
            className={botaoAtaContorno}
          >
            <Copy aria-hidden className="size-4" /> {copiado ? "Copiado!" : "Copiar link"}
          </button>
          <BotaoComConfirmacao
            titulo="Trocar o link?"
            mensagem="O link que você já mandou para de funcionar. Depois, mande o link novo pelo WhatsApp."
            textoConfirmar="Trocar o link"
            aoConfirmar={async () => {
              await gerar();
            }}
          >
            Trocar o link
          </BotaoComConfirmacao>
        </div>
      </div>
    </div>
  );
}

// ---------- Página pública do link ----------

export function AssinaturaPorLink({
  codigo,
  papel,
  acao,
}: {
  codigo: string;
  papel: string;
  acao: Acao;
}) {
  const [pronto, setPronto] = useState<string | null>(null);

  if (pronto) {
    return (
      <div role="status" className="flex flex-col items-center gap-2 rounded-2xl bg-ok-soft p-5 text-center text-pine">
        <CircleCheck aria-hidden className="size-12" />
        <p className="font-display text-[1.35rem] font-extrabold leading-tight">Assinatura registrada</p>
        <p className="text-[0.95rem] text-ink-2">Obrigado! Pode fechar esta página.</p>
      </div>
    );
  }

  return (
    <FormularioAssinatura
      papel={papel}
      acao={acao}
      campos={{ codigo }}
      ativo
      aviso="Ao assinar, você declara que conferiu o resultado desta ata. Ficam registrados data, hora e aparelho."
      aoAssinar={setPronto}
    />
  );
}
