"use client";

/** Campos do cadastro de pessoa. A casa só aparece quando o perfil é Morador. */
import { useState } from "react";
import { Campo, classeEntrada } from "@/components/ui/basicos";
import { NOME_DO_PAPEL, type Papel } from "@/lib/permissoes";

export function CamposPessoa({
  papeis,
  unidades,
  inicial,
  papelTravado = false,
}: {
  papeis: Papel[];
  unidades: { id: string; rotulo: string }[];
  inicial?: { nome?: string; papel?: Papel; unitId?: string | null; telefone?: string };
  papelTravado?: boolean;
}) {
  const [papel, setPapel] = useState<Papel>(inicial?.papel ?? papeis[0]);

  return (
    <>
      <Campo id="nome" rotulo="Nome completo">
        <input id="nome" name="nome" required minLength={3} maxLength={80} autoComplete="off" defaultValue={inicial?.nome} className={classeEntrada} />
      </Campo>

      <Campo id="papel" rotulo="Perfil" dica={papelTravado ? "Você não pode mudar o seu próprio perfil." : undefined}>
        {papelTravado ? <input type="hidden" name="papel" value={papel} /> : null}
        <select
          id="papel"
          name={papelTravado ? undefined : "papel"}
          value={papel}
          disabled={papelTravado}
          onChange={(e) => setPapel(e.target.value as Papel)}
          className={classeEntrada}
        >
          {papeis.map((p) => (
            <option key={p} value={p}>
              {NOME_DO_PAPEL[p]}
            </option>
          ))}
        </select>
      </Campo>

      {papel === "morador" ? (
        <Campo id="unitId" rotulo="Casa" dica={unidades.length ? undefined : "Cadastre as casas em Unidades primeiro."}>
          <select id="unitId" name="unitId" required defaultValue={inicial?.unitId ?? ""} className={classeEntrada}>
            <option value="" disabled>
              Escolha a casa
            </option>
            {unidades.map((u) => (
              <option key={u.id} value={u.id}>
                {u.rotulo}
              </option>
            ))}
          </select>
        </Campo>
      ) : null}

      <Campo id="telefone" rotulo="Telefone / WhatsApp (opcional)" dica="Com DDD. Usado só pela administração para contato.">
        <input
          id="telefone"
          name="telefone"
          type="tel"
          inputMode="tel"
          autoComplete="off"
          maxLength={20}
          placeholder="(91) 99999-9999"
          defaultValue={inicial?.telefone}
          className={classeEntrada}
          aria-describedby="telefone-dica"
        />
      </Campo>
    </>
  );
}
