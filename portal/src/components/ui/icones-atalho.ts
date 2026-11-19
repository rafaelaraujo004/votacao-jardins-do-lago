/**
 * Ícones dos atalhos do painel, por nome (componentes de servidor passam só o nome
 * para componentes de navegador — funções não podem atravessar essa fronteira).
 */
import {
  Award,
  Building2,
  CalendarDays,
  ChartColumn,
  ClipboardList,
  DoorOpen,
  FolderOpen,
  Landmark,
  Link2,
  Megaphone,
  ReceiptText,
  ScrollText,
  Settings,
  ShieldCheck,
  SquarePen,
  Store,
  Users,
  Vote,
  type LucideIcon,
} from "lucide-react";

export const ICONES_ATALHO = {
  Award,
  Building2,
  CalendarDays,
  ChartColumn,
  ClipboardList,
  DoorOpen,
  FolderOpen,
  Landmark,
  Link2,
  Megaphone,
  ReceiptText,
  ScrollText,
  Settings,
  ShieldCheck,
  SquarePen,
  Store,
  Users,
  Vote,
} satisfies Record<string, LucideIcon>;

export type NomeIconeAtalho = keyof typeof ICONES_ATALHO;
