"use client";

/**
 * Mantém a tela em dia com o que as OUTRAS pessoas fazem (veja src/lib/sincronizacao.ts).
 *
 * - Pergunta ao servidor "o que mudou?" a cada `intervaloSegundos`, só com a tela visível
 *   (cada pergunta lê um único documento pequeno no banco).
 * - Mudou algo que esta tela mostra → a tela se atualiza sozinha.
 * - Mudou algo de outra tela → fica anotado e ela se atualiza quando a pessoa for até lá.
 * - Ao voltar para a aba/aplicativo, pergunta na hora.
 * - Não atualiza enquanto a pessoa digita ou está com uma janela de confirmação aberta:
 *   espera ela terminar.
 * - Por segurança, atualiza também a cada `maximoMinutos` (ex.: virada do dia).
 * Não desenha nada na tela.
 */
import { useEffect, useRef, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { EVENTO_SINAIS, lerSinais, modulosDaTela, modulosQueMudaram, type ModuloSinc, type Sinais } from "@/lib/sincronizacao";

/** Quanto tempo depois da última tecla a pessoa ainda conta como "digitando". */
const DIGITANDO_MS = 5000;
/** Ao voltar para a aba, pergunta na hora (mas não mais que uma vez a cada 3 s). */
const INTERVALO_MINIMO_MS = 3000;

function ocupada(ultimaTecla: number): boolean {
  if (Date.now() - ultimaTecla < DIGITANDO_MS) return true;
  return Boolean(document.querySelector("dialog[open]"));
}

export function Sincronizar({
  montadaEm,
  intervaloSegundos = 20,
  maximoMinutos = 30,
}: {
  /** Hora (do servidor) em que a tela foi montada. */
  montadaEm: number;
  intervaloSegundos?: number;
  maximoMinutos?: number;
}) {
  const router = useRouter();
  const caminho = usePathname();
  const [, iniciar] = useTransition();

  const caminhoAtual = useRef(caminho);
  const conhecidos = useRef<Sinais | null>(null);
  const pendentes = useRef(new Set<ModuloSinc>());
  const atualizarAssimQuePuder = useRef(false);
  const ultimaAtualizacao = useRef(0);
  const ultimaPergunta = useRef(0);
  const ultimaTecla = useRef(0);
  const perguntando = useRef(false);
  const parado = useRef(false);
  const atualizarRef = useRef<() => void>(() => {});
  const perguntarRef = useRef<() => Promise<void>>(async () => {});

  // As funções ficam em refs para o relógio (montado uma vez só) usar sempre a versão atual.
  useEffect(() => {
    atualizarRef.current = () => {
      if (ocupada(ultimaTecla.current)) {
        atualizarAssimQuePuder.current = true;
        return;
      }
      atualizarAssimQuePuder.current = false;
      // router.refresh() busca a tela de novo e esquece as outras telas guardadas na memória.
      pendentes.current.clear();
      ultimaAtualizacao.current = Date.now();
      iniciar(() => router.refresh());
    };

    perguntarRef.current = async () => {
      if (perguntando.current || parado.current || !navigator.onLine) return;
      perguntando.current = true;
      ultimaPergunta.current = Date.now();
      try {
        const resposta = await fetch("/api/sinais", { cache: "no-store", credentials: "same-origin" });
        if (resposta.status === 401 || resposta.status === 403) {
          parado.current = true; // sessão terminou: a próxima navegação leva para a entrada
          return;
        }
        if (!resposta.ok) return;
        const novos = lerSinais(((await resposta.json()) as { sinais?: unknown }).sinais);
        const mudaram = modulosQueMudaram(conhecidos.current, novos, montadaEm);
        conhecidos.current = { ...conhecidos.current, ...novos };
        if (mudaram.length === 0) return;
        // Avisa quem quiser saber (ex.: o sino de notificações), em qualquer tela.
        window.dispatchEvent(new CustomEvent(EVENTO_SINAIS, { detail: { modulos: mudaram } }));
        const daTela = modulosDaTela(caminhoAtual.current);
        if (mudaram.some((m) => daTela.includes(m))) {
          atualizarRef.current();
        } else {
          for (const m of mudaram) pendentes.current.add(m);
        }
      } catch {
        // Sem internet ou servidor ocupado: tenta de novo na próxima volta.
      } finally {
        perguntando.current = false;
      }
    };
  }, [router, montadaEm]);

  // Trocou de tela: se ela mostra algo que mudou enquanto a pessoa estava em outra, atualiza.
  useEffect(() => {
    caminhoAtual.current = caminho;
    const daTela = modulosDaTela(caminho);
    if ([...pendentes.current].some((m) => daTela.includes(m))) atualizarRef.current();
  }, [caminho]);

  // Relógio único (1 s): decide quando perguntar e quando atualizar.
  useEffect(() => {
    ultimaAtualizacao.current = Date.now();
    const anotarTecla = () => {
      ultimaTecla.current = Date.now();
    };
    const aoVoltar = () => {
      if (document.visibilityState === "visible" && Date.now() - ultimaPergunta.current > INTERVALO_MINIMO_MS) {
        void perguntarRef.current();
      }
    };
    const relogio = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      const agora = Date.now();
      if (agora - ultimaPergunta.current >= intervaloSegundos * 1000) void perguntarRef.current();
      const tempoMaximo = agora - ultimaAtualizacao.current >= maximoMinutos * 60 * 1000;
      if ((atualizarAssimQuePuder.current || tempoMaximo) && !ocupada(ultimaTecla.current)) atualizarRef.current();
    }, 1000);

    window.addEventListener("keydown", anotarTecla, true);
    window.addEventListener("input", anotarTecla, true);
    window.addEventListener("focus", aoVoltar);
    document.addEventListener("visibilitychange", aoVoltar);
    void perguntarRef.current(); // primeira pergunta logo ao abrir
    return () => {
      window.clearInterval(relogio);
      window.removeEventListener("keydown", anotarTecla, true);
      window.removeEventListener("input", anotarTecla, true);
      window.removeEventListener("focus", aoVoltar);
      document.removeEventListener("visibilitychange", aoVoltar);
    };
  }, [intervaloSegundos, maximoMinutos]);

  return null;
}
