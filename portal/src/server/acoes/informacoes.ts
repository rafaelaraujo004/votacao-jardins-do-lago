"use server";

import { revalidatePath } from "next/cache";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "../firebase-admin";
import { garantirPermissao, getContexto } from "../contexto";
import { registrarAuditoria } from "../auditoria";
import { executar, lerFormulario, type Resultado } from "./resultado";
import { esquemaInformacoes } from "@/lib/validacao-informacoes";

/** Salva telefones, horário, aviso e a chave "Portal dos moradores ligado". */
export async function salvarInformacoes(_: Resultado, dados: FormData): Promise<Resultado> {
  return executar(async () => {
    const ctx = garantirPermissao(await getContexto(), "informacoes.gerenciar");
    const v = lerFormulario(esquemaInformacoes, dados);
    const db = adminDb();
    // O condomínio sai do contexto (do login), nunca do formulário.
    const ref = db.collection("condominiums").doc(ctx.condominioId);

    await db.runTransaction(async (tx) => {
      const atual = await tx.get(ref);
      const antes = (atual.get("informacoes") ?? {}) as Record<string, unknown>;
      const novas = {
        telefonePortaria: v.telefonePortaria,
        telefoneAdministracao: v.telefoneAdministracao,
        whatsappAdministracao: v.whatsappAdministracao,
        horarioAdministracao: v.horarioAdministracao,
        aviso: v.aviso,
      };
      // Quais campos mudaram (só os nomes, para a auditoria ficar curta).
      const mudaram = (Object.keys(novas) as (keyof typeof novas)[]).filter((k) => (antes[k] ?? null) !== novas[k]);

      tx.update(ref, {
        informacoes: { ...novas, atualizadoEm: FieldValue.serverTimestamp() },
        portalPublico: v.portalPublico,
      });
      registrarAuditoria(db, tx, {
        condominioId: ctx.condominioId,
        uid: ctx.uid,
        nome: ctx.nome,
        papel: ctx.papel,
        acao: "informacoes.alterar",
        alvo: `condominiums/${ctx.condominioId}`,
        detalhes: {
          camposAlterados: mudaram.join(", ") || "nenhum",
          portalPublicoAntes: atual.get("portalPublico") === true,
          portalPublico: v.portalPublico,
        },
      });
    });

    revalidatePath("/admin/informacoes");
    revalidatePath("/", "layout"); // o Início público mostra o aviso e os telefones
    return v.portalPublico ? "Informações salvas. O portal dos moradores está ligado." : "Informações salvas. O portal dos moradores está desligado.";
  });
}
