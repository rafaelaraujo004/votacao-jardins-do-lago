import "server-only";
import type { NextRequest } from "next/server";
import { adminAppCheck } from "./firebase-admin";

/**
 * Confere o token do App Check (prova de que o pedido veio do nosso site,
 * e não de um robô). Só é exigido quando APP_CHECK_ENFORCE=true.
 */
export async function appCheckValido(req: NextRequest): Promise<boolean> {
  if (process.env.APP_CHECK_ENFORCE !== "true") return true;
  const token = req.headers.get("x-firebase-appcheck");
  if (!token) return false;
  try {
    await adminAppCheck().verifyToken(token);
    return true;
  } catch {
    return false;
  }
}
