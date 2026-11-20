"use client";

/**
 * Na página "Notificações": ao abrir, marca "vi as notificações agora" e avisa o
 * sino do topo para zerar o número. Não desenha nada.
 */
import { useEffect } from "react";
import { marcarNotificacoesVistas } from "@/server/acoes/notificacoes";
import { EVENTO_VISTAS } from "./sino";

export function MarcarComoVistas() {
  useEffect(() => {
    let ativo = true;
    void marcarNotificacoesVistas()
      .then((r) => {
        if (ativo && r.ok && r.vistasEm) window.dispatchEvent(new CustomEvent(EVENTO_VISTAS, { detail: { vistasEm: r.vistasEm } }));
      })
      .catch(() => undefined);
    return () => {
      ativo = false;
    };
  }, []);
  return null;
}
