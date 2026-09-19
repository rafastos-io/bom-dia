import {
  CalendarDays,
  Layers,
  Lightbulb,
  Repeat2,
  Sun,
  type LucideIcon,
} from "lucide-react"

export type AreaId = "hoje" | "agenda" | "rotina" | "ideias" | "projetos"

export type AreaDef = {
  id: AreaId
  label: string
  caption: string
  path: string
  icon: LucideIcon
}

export const AREAS: AreaDef[] = [
  { id: "hoje", label: "Hoje", caption: "Prioridades do dia", path: "/", icon: Sun },
  {
    id: "agenda",
    label: "Agenda",
    caption: "Prazos no calendário",
    path: "/agenda",
    icon: CalendarDays,
  },
  {
    id: "rotina",
    label: "Rotina",
    caption: "Hábitos e repetições",
    path: "/rotina",
    icon: Repeat2,
  },
  {
    id: "ideias",
    label: "Ideias",
    caption: "Captura e incubação",
    path: "/ideias",
    icon: Lightbulb,
  },
  {
    id: "projetos",
    label: "Projetos",
    caption: "Frentes e iniciativas",
    path: "/projetos",
    icon: Layers,
  },
]

export function areaByPath(pathname: string): AreaDef {
  if (pathname.startsWith("/agenda")) return AREAS[1]
  if (pathname.startsWith("/rotina")) return AREAS[2]
  if (pathname.startsWith("/ideias")) return AREAS[3]
  if (pathname.startsWith("/projetos")) return AREAS[4]
  return AREAS[0]
}
