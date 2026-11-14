import type { Metadata } from "next";
import { CalendarDays, DoorOpen, Package, QrCode, Search, UserCheck, Users } from "lucide-react";
import { exigirPermissao } from "@/server/contexto";
import { formatarData } from "@/lib/formato";
import { Atalho } from "@/components/ui/atalho";
import { Alerta, Cartao, EstadoVazio } from "@/components/ui/basicos";

export const metadata: Metadata = { title: "Portaria" };

export default async function PaginaPortaria() {
  const ctx = await exigirPermissao("area.portaria");

  return (
    <div className="flex flex-col gap-5">
      <Cartao className="surgir flex flex-col gap-1">
        <p className="text-[0.78rem] font-bold uppercase tracking-[0.1em] text-plum">
          Hoje · {formatarData(new Date(), ctx.fuso)}
        </p>
        <h1 className="text-[1.8rem] font-bold text-destaque">Tela de trabalho da portaria</h1>
        <p className="text-ink-2">Tudo o que a portaria precisa, sem trocar de tela.</p>
      </Cartao>

      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <li><Atalho icone={Search} titulo="Buscar" descricao="Pelo nome do visitante ou número da casa" emBreve="Fase 3" /></li>
        <li><Atalho icone={QrCode} titulo="Validar código" descricao="Digite o código ou leia o QR Code" emBreve="Fase 3" tom="lake" /></li>
        <li><Atalho icone={DoorOpen} titulo="Entrada e saída" descricao="Registre quem entrou e saiu" emBreve="Fase 3" tom="plum" /></li>
        <li><Atalho icone={Package} titulo="Nova encomenda" descricao="Registre e avise a casa" emBreve="Fase 3" /></li>
      </ul>

      <div className="grid gap-4 lg:grid-cols-3">
        <Cartao className="flex flex-col gap-3">
          <h2 className="text-lg font-bold">Esperados hoje</h2>
          <EstadoVazio icone={UserCheck} titulo="Nenhum visitante na lista">
            Os visitantes autorizados pelos moradores aparecerão aqui.
          </EstadoVazio>
        </Cartao>
        <Cartao className="flex flex-col gap-3">
          <h2 className="text-lg font-bold">Dentro do condomínio agora</h2>
          <EstadoVazio icone={Users} titulo="Ninguém registrado">
            Quem entrar pela portaria aparecerá aqui até a saída.
          </EstadoVazio>
        </Cartao>
        <Cartao className="flex flex-col gap-3">
          <h2 className="text-lg font-bold">Reservas de hoje</h2>
          <EstadoVazio icone={CalendarDays} titulo="Nenhuma reserva hoje">
            As áreas de lazer reservadas para hoje aparecerão aqui.
          </EstadoVazio>
        </Cartao>
      </div>

      <Alerta tipo="info" titulo="Fase 3 da construção">
        As listas acima e os botões de busca, código, entrada e encomendas serão ligados na Fase 3. A portaria não tem
        acesso ao financeiro.
      </Alerta>
    </div>
  );
}
