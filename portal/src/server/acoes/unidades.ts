"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "../firebase-admin";
import { garantirPermissao, getContexto } from "../contexto";
import { registrarAuditoria } from "../auditoria";
import { ErroDeNegocio, executar, lerFormulario, type Resultado } from "./resultado";
import { idDaUnidade } from "../dados/unidades";
import { idDocumento } from "@/lib/validacao";

const texto = (max: number) => z.string().trim().max(max, `Use no máximo ${max} caracteres.`);

const esquemaSequencia = z
  .object({
    de: z.coerce.number({ error: "Informe o primeiro número." }).int("Use números inteiros.").min(1, "Comece do número 1 ou maior."),
    ate: z.coerce.number({ error: "Informe o último número." }).int("Use números inteiros.").max(9999, "O último número é grande demais."),
    prefixo: texto(20).min(1, "Informe como chamar as unidades (ex.: Casa).").default("Casa"),
    quadra: texto(20).optional().default(""),
  })
  .refine((v) => v.ate >= v.de, { message: "O último número precisa ser maior ou igual ao primeiro." })
  .refine((v) => v.ate - v.de < 400, { message: "Cadastre no máximo 400 unidades por vez." });

/** Cadastra várias casas de uma vez (ex.: Casa 1 a Casa 220). Não altera as que já existem. */
export async function cadastrarSequencia(_: Resultado, dados: FormData): Promise<Resultado> {
  return executar(async () => {
    const ctx = garantirPermissao(await getContexto(), "unidades.gerenciar");
    const v = lerFormulario(esquemaSequencia, dados);
    const db = adminDb();
    const base = db.collection("condominiums").doc(ctx.condominioId).collection("units");
    const quadra = v.quadra || null;

    const numeros = Array.from({ length: v.ate - v.de + 1 }, (_, i) => v.de + i);
    const refs = numeros.map((n) => base.doc(idDaUnidade(n, quadra)));

    const criadas = await db.runTransaction(async (tx) => {
      const existentes = await tx.getAll(...refs);
      let total = 0;
      existentes.forEach((doc, i) => {
        if (doc.exists) return;
        const n = numeros[i];
        tx.create(refs[i], {
          rotulo: quadra ? `${v.prefixo} ${n} · Quadra ${quadra}` : `${v.prefixo} ${n}`,
          numero: n,
          quadra,
          status: "ativa",
          observacao: "",
          criadoEm: FieldValue.serverTimestamp(),
        });
        total++;
      });
      if (total > 0) {
        registrarAuditoria(db, tx, {
          condominioId: ctx.condominioId,
          uid: ctx.uid,
          nome: ctx.nome,
          papel: ctx.papel,
          acao: "unidade.criar",
          detalhes: { de: v.de, ate: v.ate, quadra, criadas: total, jaExistiam: numeros.length - total },
        });
      }
      return total;
    });

    revalidatePath("/admin/unidades");
    const jaExistiam = numeros.length - criadas;
    if (criadas === 0) throw new ErroDeNegocio("Todas essas unidades já estavam cadastradas. Nada foi alterado.");
    return jaExistiam > 0
      ? `${criadas} unidades cadastradas. ${jaExistiam} já existiam e foram mantidas.`
      : `${criadas} unidades cadastradas.`;
  });
}

const esquemaUnidade = z.object({
  id: idDocumento,
  rotulo: texto(60).min(1, "Informe o nome da unidade (ex.: Casa 12)."),
  quadra: texto(20).optional().default(""),
  status: z.enum(["ativa", "inativa"], { error: "Escolha a situação da unidade." }),
  observacao: texto(300).optional().default(""),
});

/** Edita os dados de uma casa. */
export async function salvarUnidade(_: Resultado, dados: FormData): Promise<Resultado> {
  return executar(async () => {
    const ctx = garantirPermissao(await getContexto(), "unidades.gerenciar");
    const v = lerFormulario(esquemaUnidade, dados);
    const db = adminDb();
    const ref = db.collection("condominiums").doc(ctx.condominioId).collection("units").doc(v.id);

    await db.runTransaction(async (tx) => {
      const atual = await tx.get(ref);
      if (!atual.exists) throw new ErroDeNegocio("Esta unidade não foi encontrada. Atualize a página.");
      const novo = { rotulo: v.rotulo, quadra: v.quadra || null, status: v.status, observacao: v.observacao };
      tx.update(ref, { ...novo, atualizadoEm: FieldValue.serverTimestamp() });
      registrarAuditoria(db, tx, {
        condominioId: ctx.condominioId,
        uid: ctx.uid,
        nome: ctx.nome,
        papel: ctx.papel,
        acao: "unidade.alterar",
        alvo: `units/${v.id}`,
        detalhes: {
          rotuloAntes: String(atual.get("rotulo") ?? ""),
          rotulo: v.rotulo,
          statusAntes: String(atual.get("status") ?? ""),
          status: v.status,
        },
      });
    });

    revalidatePath("/admin/unidades");
    revalidatePath(`/admin/unidades/${v.id}`);
    return "Unidade atualizada.";
  });
}
