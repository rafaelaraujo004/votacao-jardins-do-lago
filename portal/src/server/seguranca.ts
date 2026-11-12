import "server-only";
import type { NextRequest } from "next/server";

/**
 * Proteção contra pedidos forjados de outros sites (CSRF):
 * pedidos que alteram algo precisam vir do próprio portal.
 */
export function mesmaOrigem(req: NextRequest): boolean {
  const origem = req.headers.get("origin");
  if (!origem) return false;
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  try {
    return new URL(origem).host === host;
  } catch {
    return false;
  }
}

/** IP de quem fez o pedido (usado só para limitar tentativas; não é exibido nem gravado em texto). */
export function ipDoPedido(req: NextRequest): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "desconhecido"
  );
}
