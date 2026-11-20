"use client";

/**
 * "Use o portal como app": logo ao entrar, pede para PERMITIR AS NOTIFICAÇÕES e mostra
 * como INSTALAR O APP na tela inicial. Aparece em toda sessão até as duas coisas
 * estarem feitas ("Agora não" esconde só até a próxima vez que a pessoa entrar).
 *
 * - Notificações: registra o service worker (/sw.js), pede a permissão e guarda a
 *   inscrição deste aparelho no servidor. Se já estava permitido, só atualiza a
 *   inscrição em silêncio (ex.: outra pessoa entrou neste aparelho).
 * - Instalar: no Android/Chrome/Edge usa o pedido de instalação do próprio navegador;
 *   no iPhone explica "Compartilhar → Adicionar à Tela de Início" (lá as notificações
 *   só funcionam com o app instalado).
 * Outras telas podem reabrir esta janela com o evento "portal:ativar-app".
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Bell, BellOff, CheckCircle2, Download, Share, Smartphone, X } from "lucide-react";
import { chavePublicaPush, salvarInscricaoPush } from "@/server/acoes/push";
import { cx } from "@/lib/cx";

export const EVENTO_ATIVAR_APP = "portal:ativar-app";
const CHAVE_ADIADO = "portal-ativar-app-adiado";

type PedidoInstalacao = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };
type EstadoNotificacao = "sem-suporte" | "pedir" | "ativando" | "ativada" | "bloqueada" | "erro";

/** Chave VAPID (texto base64url) → bytes, como o navegador pede. */
function paraBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const preenchido = (base64url + "=".repeat((4 - (base64url.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const bruto = atob(preenchido);
  const bytes = new Uint8Array(new ArrayBuffer(bruto.length));
  for (let i = 0; i < bruto.length; i++) bytes[i] = bruto.charCodeAt(i);
  return bytes;
}

function lerAdiado(): boolean {
  try {
    return sessionStorage.getItem(CHAVE_ADIADO) === "1";
  } catch {
    return false;
  }
}

function anotarAdiado() {
  try {
    sessionStorage.setItem(CHAVE_ADIADO, "1");
  } catch {
    // Sem armazenamento (aba anônima): a janela volta na próxima tela, sem problema.
  }
}

/** Inscreve este aparelho e manda a inscrição para o servidor. */
async function inscrever(): Promise<boolean> {
  const registro = await navigator.serviceWorker.ready;
  let inscricao = await registro.pushManager.getSubscription();
  if (!inscricao) {
    const chave = await chavePublicaPush();
    if (!chave) return false;
    inscricao = await registro.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: paraBytes(chave) });
  }
  const r = await salvarInscricaoPush(inscricao.toJSON());
  return r.ok;
}

export function AtivarApp() {
  const dialogo = useRef<HTMLDialogElement>(null);
  const [notificacao, setNotificacao] = useState<EstadoNotificacao>("sem-suporte");
  const [instalado, setInstalado] = useState(false);
  const [iphone, setIphone] = useState(false);
  const [pedidoInstalacao, setPedidoInstalacao] = useState<PedidoInstalacao | null>(null);
  const [pronto, setPronto] = useState(false);

  // Descobre o que este aparelho permite e registra o service worker.
  useEffect(() => {
    const suportaPush = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
    const ehIphone = /iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    const inicio = window.setTimeout(() => {
      setInstalado(standalone);
      setIphone(ehIphone);
      if (!suportaPush) setNotificacao("sem-suporte");
      else if (Notification.permission === "granted") setNotificacao("ativada");
      else if (Notification.permission === "denied") setNotificacao("bloqueada");
      else setNotificacao("pedir");
      setPronto(true);
    }, 0);
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker
        .register("/sw.js")
        .then(() => {
          // Já permitido: atualiza a inscrição em silêncio (outra pessoa pode ter entrado neste aparelho).
          if (suportaPush && Notification.permission === "granted") void inscrever().catch(() => undefined);
        })
        .catch(() => undefined);
    }
    const aoPedirInstalacao = (e: Event) => {
      e.preventDefault();
      setPedidoInstalacao(e as PedidoInstalacao);
    };
    const aoInstalar = () => {
      setInstalado(true);
      setPedidoInstalacao(null);
    };
    window.addEventListener("beforeinstallprompt", aoPedirInstalacao);
    window.addEventListener("appinstalled", aoInstalar);
    return () => {
      window.clearTimeout(inicio);
      window.removeEventListener("beforeinstallprompt", aoPedirInstalacao);
      window.removeEventListener("appinstalled", aoInstalar);
    };
  }, []);

  const falta = useCallback(
    () => ((notificacao === "pedir" || notificacao === "erro") ? 1 : 0) + (!instalado && (pedidoInstalacao || iphone) ? 1 : 0),
    [notificacao, instalado, pedidoInstalacao, iphone],
  );

  // Abre sozinha ao entrar, se falta algo e a pessoa não disse "Agora não" nesta sessão.
  useEffect(() => {
    if (!pronto || lerAdiado() || falta() === 0) return;
    const t = window.setTimeout(() => {
      if (!dialogo.current?.open) dialogo.current?.showModal();
    }, 1200);
    return () => window.clearTimeout(t);
  }, [pronto, falta]);

  // Outras telas (ex.: o sino) podem pedir para abrir.
  useEffect(() => {
    const abrir = () => {
      if (!dialogo.current?.open) dialogo.current?.showModal();
    };
    window.addEventListener(EVENTO_ATIVAR_APP, abrir);
    return () => window.removeEventListener(EVENTO_ATIVAR_APP, abrir);
  }, []);

  async function permitir() {
    setNotificacao("ativando");
    try {
      const resposta = await Notification.requestPermission();
      if (resposta === "granted") setNotificacao((await inscrever()) ? "ativada" : "erro");
      else setNotificacao(resposta === "denied" ? "bloqueada" : "pedir");
    } catch {
      setNotificacao("erro");
    }
  }

  async function instalar() {
    if (!pedidoInstalacao) return;
    await pedidoInstalacao.prompt();
    const escolha = await pedidoInstalacao.userChoice.catch(() => ({ outcome: "dismissed" as const }));
    if (escolha.outcome === "accepted") setInstalado(true);
    setPedidoInstalacao(null);
  }

  function agoraNao() {
    anotarAdiado();
    dialogo.current?.close();
  }

  const passo = "flex items-start gap-3 rounded-2xl border border-borda-luz bg-canvas p-4";
  const icone = "grid size-11 shrink-0 place-items-center rounded-[14px]";

  return (
    <dialog
      ref={dialogo}
      aria-labelledby="titulo-ativar-app"
      className="m-auto w-[min(94vw,30rem)] rounded-[26px] border border-borda-luz bg-surface p-0 text-ink shadow-float backdrop:bg-black/55"
      onClose={() => anotarAdiado()}
    >
      <div className="flex flex-col gap-4 p-5 sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="rotulo-caixa text-plum">Portal no seu celular</p>
            <h2 id="titulo-ativar-app" className="mt-1 text-[1.45rem] font-bold leading-tight text-destaque">
              Receba os avisos do residencial na hora
            </h2>
          </div>
          <button type="button" onClick={agoraNao} className="grid size-10 shrink-0 place-items-center rounded-full hover:bg-surface-2" title="Fechar">
            <X aria-hidden className="size-5" />
            <span className="sr-only">Fechar</span>
          </button>
        </div>

        {/* 1. Notificações */}
        <div className={passo}>
          <span className={cx(icone, notificacao === "ativada" ? "bg-ok-soft text-pine" : notificacao === "bloqueada" ? "bg-danger-soft text-danger" : "bg-plum-soft text-plum")}>
            {notificacao === "bloqueada" ? <BellOff aria-hidden className="size-6" /> : <Bell aria-hidden className="size-6" />}
          </span>
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <b className="leading-snug">1. Permitir notificações</b>
            {notificacao === "ativada" ? (
              <p className="flex items-center gap-1.5 font-bold text-pine">
                <CheckCircle2 aria-hidden className="size-5" /> Ativadas neste aparelho
              </p>
            ) : notificacao === "bloqueada" ? (
              <p className="text-[0.92rem] text-ink-2">
                Estão <b>bloqueadas</b> neste aparelho. Para liberar: toque no cadeado ao lado do endereço do site →
                <b> Permissões</b> (ou Configurações do site) → <b>Notificações</b> → <b>Permitir</b>. Depois, recarregue a página.
              </p>
            ) : notificacao === "sem-suporte" ? (
              <p className="text-[0.92rem] text-ink-2">
                {iphone && !instalado
                  ? "No iPhone, as notificações funcionam depois de instalar o app (passo 2). Instale e abra pelo ícone na tela de início."
                  : "Este navegador não recebe notificações. Use o Chrome (Android) ou instale o app."}
              </p>
            ) : (
              <>
                <p className="text-[0.92rem] text-ink-2">
                  Comunicados, votações, reservas confirmadas e respostas aos seus pedidos chegam no celular, mesmo com o portal fechado.
                </p>
                <button
                  type="button"
                  onClick={permitir}
                  disabled={notificacao === "ativando"}
                  className="botao-verde inline-flex min-h-12 items-center justify-center gap-2 self-start rounded-full px-5 font-bold disabled:opacity-70"
                >
                  <Bell aria-hidden className="size-5" /> {notificacao === "ativando" ? "Ativando…" : "Permitir notificações"}
                </button>
                {notificacao === "erro" ? (
                  <p className="text-[0.88rem] font-bold text-danger">Não deu para ativar agora. Confira a internet e tente de novo.</p>
                ) : null}
              </>
            )}
          </div>
        </div>

        {/* 2. Instalar o app */}
        <div className={passo}>
          <span className={cx(icone, instalado ? "bg-ok-soft text-pine" : "bg-lake-soft text-lake")}>
            <Smartphone aria-hidden className="size-6" />
          </span>
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <b className="leading-snug">2. Instalar o app na tela inicial</b>
            {instalado ? (
              <p className="flex items-center gap-1.5 font-bold text-pine">
                <CheckCircle2 aria-hidden className="size-5" /> App instalado
              </p>
            ) : pedidoInstalacao ? (
              <>
                <p className="text-[0.92rem] text-ink-2">Abre direto pelo ícone, como qualquer aplicativo, sem procurar o link.</p>
                <button
                  type="button"
                  onClick={instalar}
                  className="saltado inline-flex min-h-12 items-center justify-center gap-2 self-start rounded-full px-5 font-bold text-pine active:shadow-afundado"
                >
                  <Download aria-hidden className="size-5" /> Instalar o app
                </button>
              </>
            ) : iphone ? (
              <p className="text-[0.92rem] text-ink-2">
                No Safari, toque em <Share aria-label="Compartilhar" className="inline size-4 align-text-bottom" /> <b>Compartilhar</b> e depois em
                <b> Adicionar à Tela de Início</b>.
              </p>
            ) : (
              <p className="text-[0.92rem] text-ink-2">
                No menu do navegador (<b>⋮</b>), escolha <b>Instalar app</b> ou <b>Adicionar à tela inicial</b>.
              </p>
            )}
          </div>
        </div>

        <button type="button" onClick={agoraNao} className="min-h-11 self-center rounded-full px-4 font-bold text-muted hover:text-ink">
          {falta() === 0 ? "Pronto" : "Agora não"}
        </button>
      </div>
    </dialog>
  );
}

/**
 * Na tela de entrada, depois de "Sair": este aparelho deixa de receber as
 * notificações de quem saiu (importante em celular dividido).
 */
export function CancelarNotificacoesAoSair() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    void navigator.serviceWorker
      .getRegistration()
      .then((registro) => registro?.pushManager.getSubscription())
      .then((inscricao) => inscricao?.unsubscribe())
      .catch(() => undefined);
  }, []);
  return null;
}
