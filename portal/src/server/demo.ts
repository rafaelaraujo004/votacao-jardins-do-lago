import "server-only";

/**
 * O login de demonstração só existe quando TODAS as condições valem:
 * - não é build de produção (`next build`, `next start`, Vercel);
 * - o portal foi configurado para usar o simulador;
 * - o Admin SDK está apontado para os simuladores de Auth e Firestore.
 * Assim, mesmo que alguém esqueça uma variável, a versão publicada não tem o atalho.
 */
export function demoAtivo(): boolean {
  return (
    process.env.NODE_ENV !== "production" &&
    process.env.NEXT_PUBLIC_USE_EMULATORS === "true" &&
    Boolean(process.env.FIREBASE_AUTH_EMULATOR_HOST) &&
    Boolean(process.env.FIRESTORE_EMULATOR_HOST)
  );
}
