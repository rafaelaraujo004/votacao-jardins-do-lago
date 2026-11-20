"use client";

/**
 * O SINO de notificações (topo da área do morador e da gestão).
 * - O número em cima do sino = o que pede ação (aprovar, votar) + o que é novo.
 * - Busca a lista ao abrir a tela, quando a pessoa toca no sino e quando o
 *   <Sincronizar> avisa que um módulo do sino mudou (evento "portal:sinais").
 * - Ao abrir, marca "vi as notificações agora" (o "Novo" continua aparecendo até fechar).
 * Usa <dialog> nativo (foco preso, Esc fecha), como a gaveta do menu.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, X } from "lucide-react";
import { marcarNotificacoesVistas } from "@/server/acoes/notificacoes";
import { contarSino, lerNotificacoes, MODULOS_DO_SINO, rotuloContagem, type Notificacao } from "@/lib/notificacoes";
import { EVENTO_SINAIS } from "@/lib/sincronizacao";
import { cx } from "@/lib/cx";
import { ListaNotificacoes } from "./lista";
import { EVENTO_ATIVAR_APP } from "@/components/app/ativar-app";

type Dados = { itens: Notificacao[]; vistasEm: number | null; fuso?: string; agora: number };

/** Evento que a página de notificações dispara ao marcar como vistas (o sino zera junto). */
export const EVENTO_VISTAS = "portal:notificacoes-vistas";

export function Sino({ className, paginaHref }: { className?: string; paginaHref: string }) {
  const dialogo = useRef<HTMLDialogElement>(null);
  const caminho = usePathname();
  const [dados, setDados] = useState<Dados | null>(null);
  const [erro, setErro] = useState(false);
  /** "Visto" de antes de abrir: os itens continuam marcados como "Novo" enquanto o sino está aberto. */
  const [vistasAoAbrir, setVistasAoAbrir] = useState<number | null>(null);
  const [aberto, setAberto] = useState(false);
  const buscando = useRef(false);
  /** Este aparelho ainda não recebe as notificações no celular (mostra o botão para ativar). */
  const [semNoCelular, setSemNoCelular] = useState(false);

  const buscar = useCallback(async () => {
    if (buscando.current) return;
    buscando.current = true;
    try {
      const r = await fetch("/api/notificacoes", { cache: "no-store", credentials: "same-origin" });
      if (!r.ok) throw new Error(String(r.status));
      const j = (await r.json()) as { itens?: unknown; vistasEm?: unknown; fuso?: unknown; agora?: unknown };
      setDados({
        itens: lerNotificacoes(j.itens),
        vistasEm: typeof j.vistasEm === "number" ? j.vistasEm : null,
        fuso: typeof j.fuso === "string" ? j.fuso : undefined,
        agora: typeof j.agora === "number" ? j.agora : Date.now(),
      });
      setErro(false);
    } catch {
      setErro(true);
    } finally {
      buscando.current = false;
    }
  }, []);

  // Primeira busca, e de novo quando um módulo do sino muda ou a página marca como vistas.
  useEffect(() => {
    // Logo depois de a tela aparecer (sem atrasar o primeiro desenho).
    const primeira = window.setTimeout(() => void buscar(), 0);
    const aoMudar = (e: Event) => {
      const modulos = (e as CustomEvent<{ modulos?: string[] }>).detail?.modulos ?? [];
      if (modulos.some((m) => (MODULOS_DO_SINO as readonly string[]).includes(m))) void buscar();
    };
    const aoVer = (e: Event) => {
      const vistasEm = (e as CustomEvent<{ vistasEm?: number }>).detail?.vistasEm;
      if (typeof vistasEm === "number") setDados((d) => (d ? { ...d, vistasEm } : d));
    };
    window.addEventListener(EVENTO_SINAIS, aoMudar);
    window.addEventListener(EVENTO_VISTAS, aoVer);
    return () => {
      window.clearTimeout(primeira);
      window.removeEventListener(EVENTO_SINAIS, aoMudar);
      window.removeEventListener(EVENTO_VISTAS, aoVer);
    };
  }, [buscar]);

  // Mudou de tela: fecha o sino.
  useEffect(() => {
    dialogo.current?.close();
  }, [caminho]);

  // Ao fechar: o que foi visto deixa de ser "Novo".
  useEffect(() => {
    const d = dialogo.current;
    if (!d) return;
    const aoFechar = () => {
      document.documentElement.classList.remove("overflow-hidden");
      setAberto(false);
      setVistasAoAbrir(null);
    };
    d.addEventListener("close", aoFechar);
    return () => d.removeEventListener("close", aoFechar);
  }, []);

  async function abrir() {
    setSemNoCelular(!("Notification" in window) || Notification.permission !== "granted");
    setVistasAoAbrir(dados?.vistasEm ?? null);
    setAberto(true);
    document.documentElement.classList.add("overflow-hidden");
    dialogo.current?.showModal();
    void buscar();
    const r = await marcarNotificacoesVistas().catch(() => null);
    if (r?.ok && r.vistasEm) {
      const vistasEm = r.vistasEm;
      setDados((d) => (d ? { ...d, vistasEm } : d));
    }
  }

  const total = dados ? contarSino(dados.itens, dados.vistasEm) : 0;
  const vistasNaLista = aberto ? vistasAoAbrir : (dados?.vistasEm ?? null);

  return (
    <>
      <button
        type="button"
        onClick={abrir}
        aria-haspopup="dialog"
        title="Notificações"
        className={cx("relative grid size-11 shrink-0 place-items-center rounded-full", className)}
      >
        <Bell aria-hidden className="size-5" />
        {total > 0 ? (
          <span
            aria-hidden
            className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-[#E4572E] px-1 text-[0.72rem] font-bold leading-none text-white ring-2 ring-band"
          >
            {rotuloContagem(total)}
          </span>
        ) : null}
        <span className="sr-only">{total > 0 ? `Notificações: ${total} para ver` : "Notificações"}</span>
      </button>

      <dialog
        ref={dialogo}
        aria-label="Notificações"
        className="gaveta m-0 ml-auto h-dvh max-h-none w-[min(94vw,420px)] max-w-none bg-canvas p-0 text-ink shadow-[-12px_0_32px_rgb(0_0_0/0.35)]"
        onClick={(e) => {
          // Toque no fundo escurecido ou num item/link: fecha.
          const alvo = e.target as HTMLElement;
          if (alvo === e.currentTarget || alvo.closest("a")) e.currentTarget.close();
        }}
      >
        <div className="flex h-full flex-col pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)]">
          <div className="flex items-center justify-between gap-2 border-b border-line bg-band px-4 py-3 text-band-fg">
            <span className="flex items-center gap-2 font-display text-[1.1rem] font-bold">
              <Bell aria-hidden className="size-5" /> Notificações
            </span>
            <button
              type="button"
              onClick={() => dialogo.current?.close()}
              title="Fechar"
              className="grid size-11 place-items-center rounded-full border border-white/15 bg-white/10 hover:bg-white/20"
            >
              <X aria-hidden className="size-6" />
              <span className="sr-only">Fechar notificações</span>
            </button>
          </div>
          <div className="flex-1 overflow-y-auto px-3 py-4">
            {dados ? (
              <ListaNotificacoes itens={dados.itens} vistasEm={vistasNaLista} agora={dados.agora} fuso={dados.fuso} />
            ) : erro ? (
              <p className="px-2 py-8 text-center text-muted">Não deu para carregar agora. Confira a internet e toque no sino de novo.</p>
            ) : (
              <p className="px-2 py-8 text-center text-muted">Carregando…</p>
            )}
            {dados && erro ? (
              <p className="mt-3 px-2 text-center text-[0.85rem] text-muted">Sem internet: mostrando a última lista carregada.</p>
            ) : null}
          </div>
          <div className="flex flex-col gap-1 border-t border-line px-4 py-3">
            {semNoCelular ? (
              <button
                type="button"
                onClick={() => {
                  dialogo.current?.close();
                  window.dispatchEvent(new Event(EVENTO_ATIVAR_APP));
                }}
                className="botao-verde flex min-h-11 items-center justify-center gap-2 rounded-full font-bold"
              >
                <Bell aria-hidden className="size-5" /> Receber no celular
              </button>
            ) : null}
            <Link href={paginaHref} className="flex min-h-11 items-center justify-center rounded-full font-bold text-lake hover:underline">
              Ver todas as notificações
            </Link>
          </div>
        </div>
      </dialog>
    </>
  );
}
