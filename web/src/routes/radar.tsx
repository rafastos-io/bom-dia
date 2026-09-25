import { Button } from "@rafastos/ui/button"
import { NativeSelect, NativeSelectOption } from "@rafastos/ui/native-select"
import { Skeleton } from "@rafastos/ui/skeleton"
import { Check, ChevronDown, ChevronRight, RefreshCw, RotateCcw, Sparkles } from "lucide-react"
import { useState, type ReactNode } from "react"
import { toast } from "sonner"
import { QueryError } from "@/components/area-board"
import { Dot, type DotTone } from "@/components/app/dot"
import { EmptyState } from "@/components/app/empty-state"
import { Panel } from "@/components/app/panel"
import { ScreenHeader } from "@/components/app/screen-header"
import { Segmented } from "@/components/app/segmented"
import { openLink } from "@/lib/open"
import {
  useAnalyzeAI,
  useDismissActivity,
  useDismissDivergence,
  usePatchTask,
  useProjects,
  useRadar,
  useRadarReviews,
  useSuggestionAction,
} from "@/lib/queries"
import { fmtDate } from "@/lib/tasks"
import type {
  RadarActivityItem,
  RadarItem,
  RadarReviewItem,
  RadarSuggestionItem,
} from "@/lib/types"

type RadarView = "progresso" | "no-ar" | "revisoes"

const NO_AR_PAGE = 20
const DAY_PREVIEW = 8

const WEEKDAYS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"]

/** "Hoje", "Ontem" ou "qua 17/09". */
function fmtDay(date: string): string {
  if (!date) return "Sem data"
  const today = new Date().toISOString().slice(0, 10)
  const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10)
  if (date === today) return "Hoje"
  if (date === yesterday) return "Ontem"
  const parsed = new Date(`${date}T12:00:00Z`)
  const [, month, day] = date.split("-")
  if (Number.isNaN(parsed.getTime())) return date
  return `${WEEKDAYS[parsed.getUTCDay()] ?? ""} ${day}/${month}`.trim()
}

function fmtSync(iso: string): string {
  if (!iso) return ""
  const at = Date.parse(iso)
  if (Number.isNaN(at)) return ""
  const minutes = Math.floor((Date.now() - at) / 60_000)
  if (minutes < 1) return "agora"
  if (minutes < 60) return `há ${minutes} min`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `há ${hours} h`
  return `há ${Math.floor(hours / 24)} d`
}

/** Quanto mais velho o item, mais quente o tom. */
function ageTone(ageDays: number): DotTone {
  if (ageDays < 7) return "blue"
  if (ageDays < 15) return "amber"
  return "pink"
}

function ItemLine({ item, meta, clamp }: { item: RadarItem; meta?: string; clamp?: boolean }) {
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
      <p className={clamp ? "rf-caption line-clamp-3 text-foreground" : "rf-caption text-foreground"} title={clamp ? item.text : undefined}>
        {item.text}
      </p>
      <p className="rf-caption text-muted-foreground">
        {item.note}
        {item.section ? ` · ${item.section}` : ""}
        {meta ? ` · ${meta}` : ""}
      </p>
    </div>
  )
}

export function RadarPage() {
  const radar = useRadar()
  const reviews = useRadarReviews()
  const [view, setView] = useState<RadarView>("progresso")
  const [openDays, setOpenDays] = useState<Record<string, boolean>>({})
  const [fullDays, setFullDays] = useState<Record<string, boolean>>({})
  const [noArLimit, setNoArLimit] = useState(NO_AR_PAGE)

  const progresso = radar.data?.progresso ?? []
  const noAr = radar.data?.noAr ?? []
  const synced = fmtSync(radar.data?.atualizadoEm ?? "")

  const totalProgresso = progresso.reduce((total, day) => total + day.items.length, 0)
  const totalRevisoes = reviews.data
    ? reviews.data.divergentes.length +
      reviews.data.semProjeto.length +
      reviews.data.fechadas.length +
      reviews.data.semRegistro.length +
      reviews.data.sugestoes.length
    : 0

  const refresh = (
    <div className="flex items-center gap-rf-2">
      {synced ? <span className="rf-caption text-muted-foreground">Sincronizado {synced}</span> : null}
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => void radar.refetch()}
        disabled={radar.isFetching}
      >
        <RefreshCw className={radar.isFetching ? "animate-spin" : undefined} aria-hidden />
        Atualizar
      </Button>
    </div>
  )

  return (
    <>
      <ScreenHeader
        title="Radar"
        description="O que andou na CENTRAL e o que ficou no ar — leitura derivada do vault, sem escrever nada nele."
        actions={refresh}
      />

      {radar.isPending ? (
        <div className="flex flex-col gap-rf-3">
          <Skeleton className="h-9 w-56 rounded-full" />
          <Skeleton className="h-64 rounded-[var(--rf-radius-card)]" />
        </div>
      ) : radar.isError ? (
        <QueryError
          message="Não consegui carregar o radar agora."
          onRetry={() => void radar.refetch()}
        />
      ) : !radar.data?.atualizadoEm ? (
        <Panel>
          <EmptyState
            mascot="thinking"
            title="O agente ainda não sincronizou a CENTRAL"
            description="Rode o agente local (npm --prefix agent run backfill) para trazer o progresso e o que ficou no ar."
          />
        </Panel>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-rf-3">
            <Segmented
              ariaLabel="Views do radar"
              value={view}
              onChange={setView}
              items={[
                { value: "progresso", label: `Progresso (${totalProgresso})` },
                { value: "no-ar", label: `No ar (${noAr.length})` },
                { value: "revisoes", label: `Revisões${totalRevisoes ? ` (${totalRevisoes})` : ""}` },
              ]}
            />
          </div>

          {view === "progresso" ? (
            <Panel
              title="Progresso"
              description="O que andou, agrupado por dia (últimos 14 dias da CENTRAL)."
            >
              {progresso.length === 0 ? (
                <EmptyState
                  mascot="thinking"
                  title="Nada registrado nos últimos 14 dias"
                  description="O diário e as notas de produto/projeto alimentam esta lista."
                />
              ) : (
                <ol className="flex flex-col">
                  {progresso.map((day, index) => {
                    const open = openDays[day.date] ?? index === 0
                    const full = fullDays[day.date] ?? false
                    const items = full ? day.items : day.items.slice(0, DAY_PREVIEW)
                    return (
                      <li
                        key={day.date || index}
                        className="border-b border-[var(--rf-border)] last:border-b-0"
                      >
                        <button
                          type="button"
                          aria-expanded={open}
                          onClick={() =>
                            setOpenDays((current) => ({ ...current, [day.date]: !open }))
                          }
                          className="flex w-full items-center gap-rf-3 py-rf-3 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                        >
                          {open ? (
                            <ChevronDown className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                          ) : (
                            <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                          )}
                          <span className="rf-label text-foreground">{fmtDay(day.date)}</span>
                          <span className="rf-caption text-muted-foreground">
                            {day.items.length} {day.items.length === 1 ? "item" : "itens"}
                          </span>
                        </button>
                        {open ? (
                          <div className="flex flex-col gap-rf-2 pb-rf-3 pl-7">
                            {items.map((item, itemIndex) => (
                              <ItemLine key={`${day.date}-${itemIndex}`} item={item} clamp />
                            ))}
                            {!full && day.items.length > DAY_PREVIEW ? (
                              <button
                                type="button"
                                onClick={() => setFullDays((current) => ({ ...current, [day.date]: true }))}
                                className="self-start rf-caption text-action outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
                              >
                                ver os outros {day.items.length - DAY_PREVIEW}
                              </button>
                            ) : null}
                          </div>
                        ) : null}
                      </li>
                    )
                  })}
                </ol>
              )}
            </Panel>
          ) : view === "no-ar" ? (
            <Panel
              title="No ar"
              description="O que ficou aberto e não reapareceu como concluído — os mais velhos primeiro."
            >
              {noAr.length === 0 ? (
                <EmptyState
                  mascot="thumbsup"
                  title="Nada no ar"
                  description="Nenhuma pendência registrada na CENTRAL até agora."
                />
              ) : (
                <>
                  <ul className="flex flex-col">
                    {noAr.slice(0, noArLimit).map((item, index) => (
                      <li
                        key={`${item.path}-${index}`}
                        className="flex min-w-0 items-start gap-rf-3 border-b border-[var(--rf-border)] py-rf-3 last:border-b-0"
                      >
                        <span className="mt-0.5 inline-flex shrink-0 items-center gap-rf-1 rf-caption text-muted-foreground">
                          <Dot tone={ageTone(item.ageDays)} />
                          {item.ageDays}d
                        </span>
                        <ItemLine item={item} meta={fmtDate(item.date)} />
                      </li>
                    ))}
                  </ul>
                  {noAr.length > noArLimit ? (
                    <div className="pt-rf-3">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setNoArLimit((current) => current + NO_AR_PAGE)}
                      >
                        Mostrar mais ({noAr.length - noArLimit})
                      </Button>
                    </div>
                  ) : null}
                 </>
               )}
             </Panel>
           ) : (
             <RevisoesView />
           )}
         </>
       )}
     </>
   )
 }

function ReviewRow({
   item,
   actions,
   meta,
 }: {
   item: RadarReviewItem
   actions: ReactNode
   meta?: string
 }) {
   return (
     <li className="flex min-w-0 flex-wrap items-center gap-rf-3 border-b border-[var(--rf-border)] py-rf-3 last:border-b-0">
       <div className="flex min-w-0 flex-1 flex-col gap-0.5">
         <p className="rf-caption text-foreground">{item.title}</p>
         <p className="rf-caption text-muted-foreground">
           {item.note || "Sem nota"}
           {item.section ? ` · ${item.section}` : ""}
           {meta ? ` · ${meta}` : ""}
         </p>
       </div>
       {actions}
     </li>
   )
 }

 function RevisoesView() {
   const reviews = useRadarReviews()
   const patch = usePatchTask()
   const dismiss = useDismissDivergence()
   const dismissActivity = useDismissActivity()
   const analyze = useAnalyzeAI()
   const suggestionAction = useSuggestionAction()
   const projects = useProjects()
   const projectNames = (projects.data ?? [])
     .map((project) => project.name)
     .sort((a, b) => a.localeCompare(b, "pt-BR"))

   if (reviews.isPending) {
     return <Skeleton className="h-64 rounded-[var(--rf-radius-card)]" />
   }
   if (reviews.isError || !reviews.data) {
     return (
       <QueryError
         message="Não consegui carregar a fila de revisões."
         onRetry={() => void reviews.refetch()}
       />
     )
   }

   const { divergentes, semProjeto, fechadas, semRegistro, sugestoes } = reviews.data
   const failed = (error: unknown) =>
     toast.error(error instanceof Error ? error.message : "Não deu pra atualizar")

   return (
     <div className="flex flex-col gap-rf-4">
       <Panel
         title="Sugestões da IA"
         description="Paráfrases de “concluído” em texto livre — confirme ou ignore."
         action={
           <Button
             type="button"
             variant="outline"
             size="sm"
             disabled={analyze.isPending}
             onClick={() =>
               analyze.mutate(undefined, {
                 onError: failed,
                 onSuccess: (result) =>
                   toast.success(
                     result.suggested
                       ? `${result.suggested} sugestão(ões) nova(s)`
                       : "Nada novo para sugerir",
                   ),
               })
             }
           >
             <Sparkles aria-hidden /> {analyze.isPending ? "Analisando…" : "Analisar com IA"}
           </Button>
         }
       >
         {sugestoes.length === 0 ? (
           <EmptyState
             mascot="thinking"
             title="Nada sugerido"
             description="Rode a análise depois de documentar a semana — a IA cruza registros de progresso com demandas abertas."
           />
         ) : (
           <ul className="flex flex-col">
             {sugestoes.map((item: RadarSuggestionItem) => (
               <li
                 key={item.id}
                 className="flex min-w-0 flex-wrap items-center gap-rf-3 border-b border-[var(--rf-border)] py-rf-3 last:border-b-0"
               >
                 <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                   <p className="rf-caption text-foreground">{item.taskTitle}</p>
                   <p className="rf-caption text-muted-foreground">
                     {item.entryText}
                     {item.note ? ` · ${item.note}` : ""}
                     {` · ${Math.round(item.confidence * 100)}%`}
                   </p>
                 </div>
                 <Button
                   type="button"
                   variant="outline"
                   size="sm"
                   disabled={suggestionAction.isPending}
                   onClick={() =>
                     suggestionAction.mutate(
                       { id: item.id, action: "aceitar" },
                       { onError: failed, onSuccess: () => toast.success("Demanda concluída ✓") },
                     )
                   }
                 >
                   <Check aria-hidden /> Concluir
                 </Button>
                 <Button
                   type="button"
                   variant="ghost"
                   size="sm"
                   disabled={suggestionAction.isPending}
                   onClick={() =>
                     suggestionAction.mutate({ id: item.id, action: "ignorar" }, { onError: failed })
                   }
                 >
                   Ignorar
                 </Button>
               </li>
             ))}
           </ul>
         )}
       </Panel>

       <Panel
         title="Divergências"
         description="Concluídas aqui, mas ainda abertas na CENTRAL — reabra ou mantenha e ajuste a nota depois."
       >
         {divergentes.length === 0 ? (
           <EmptyState
             mascot="thumbsup"
             title="Nada divergindo"
             description="Nenhuma demanda concluída aqui ficou aberta na CENTRAL."
           />
         ) : (
           <ul className="flex flex-col">
             {divergentes.map((item) => (
               <ReviewRow
                 key={item.id}
                 item={item}
                 meta={item.completedAt ? `concluída em ${fmtDate(item.completedAt.slice(0, 10))}` : ""}
                 actions={
                   <>
                     <Button
                       type="button"
                       variant="outline"
                       size="sm"
                       disabled={patch.isPending}
                       onClick={() =>
                         patch.mutate(
                           { id: item.id, patch: { status: "aberta" } },
                           { onError: failed },
                         )
                       }
                     >
                       <RotateCcw aria-hidden /> Reabrir
                     </Button>
                     <Button
                       type="button"
                       variant="ghost"
                       size="sm"
                       disabled={dismiss.isPending}
                       onClick={() => dismiss.mutate(item.id, { onError: failed })}
                     >
                       <Check aria-hidden /> Manter
                     </Button>
                     <Button
                       type="button"
                       variant="ghost"
                       size="sm"
                       onClick={() => void openLink("nota", item.path)}
                     >
                       Abrir nota
                     </Button>
                   </>
                 }
               />
             ))}
           </ul>
         )}
       </Panel>

       <Panel
         title="Sem projeto"
         description="Demandas soltas — escolha o projeto para amarrar cada uma."
       >
         {semProjeto.length === 0 ? (
           <EmptyState mascot="thumbsup" title="Tudo com projeto" description="Nenhuma demanda solta." />
         ) : (
           <ul className="flex flex-col">
             {semProjeto.map((item) => (
               <ReviewRow
                 key={item.id}
                 item={item}
                 meta={item.status === "concluida" ? "concluída" : "aberta"}
                 actions={
                   <NativeSelect
                     size="sm"
                     className="w-56"
                     aria-label={`Projeto de ${item.title}`}
                     value={item.projeto}
                     disabled={patch.isPending}
                     onChange={(event) =>
                       patch.mutate(
                         { id: item.id, patch: { projeto: event.target.value } },
                         {
                           onError: failed,
                           onSuccess: () => toast.success("Projeto atualizado ✓"),
                         },
                       )
                     }
                   >
                     <NativeSelectOption value="">Sem projeto</NativeSelectOption>
                     {projectNames.map((name) => (
                       <NativeSelectOption key={name} value={name}>
                         {name}
                       </NativeSelectOption>
                     ))}
                   </NativeSelect>
                 }
               />
             ))}
           </ul>
         )}
       </Panel>

       <Panel
         title="Atividade sem registro"
         description="O repositório andou depois da última atualização da nota — documente na CENTRAL ou dispense."
       >
         {semRegistro.length === 0 ? (
           <EmptyState
             mascot="thumbsup"
             title="Nada sem registro"
             description="Toda atividade recente dos repositórios já está documentada."
           />
         ) : (
           <ul className="flex flex-col">
             {semRegistro.map((item: RadarActivityItem) => (
               <li
                 key={item.path}
                 className="flex min-w-0 flex-wrap items-center gap-rf-3 border-b border-[var(--rf-border)] py-rf-3 last:border-b-0"
               >
                 <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                   <p className="rf-caption text-foreground">{item.title || item.path}</p>
                   <p className="rf-caption text-muted-foreground">
                     {item.detail ? `${item.detail} · ` : ""}
                     atividade {fmtDate(item.activityAt)} · nota em {fmtDate(item.updatedAt)}
                   </p>
                 </div>
                 <Button
                   type="button"
                   variant="outline"
                   size="sm"
                   onClick={() => void openLink("nota", item.path)}
                 >
                   Abrir nota
                 </Button>
                 <Button
                   type="button"
                   variant="ghost"
                   size="sm"
                   disabled={dismissActivity.isPending}
                   onClick={() => dismissActivity.mutate(item.path, { onError: failed })}
                 >
                   Dispensar
                 </Button>
               </li>
             ))}
           </ul>
         )}
       </Panel>

       <Panel
         title="Fechadas pela CENTRAL"
         description="Itens que saíram da nota e fecharam a demanda — reabra se foi engano."
       >
         {fechadas.length === 0 ? (
           <EmptyState
             mascot="thumbsup"
             title="Nenhum fechamento recente"
             description="Nada fechado pelo espelho para revisar."
           />
         ) : (
           <ul className="flex flex-col">
             {fechadas.map((item) => (
               <ReviewRow
                 key={item.id}
                 item={item}
                 meta={item.completedAt ? `fechada em ${fmtDate(item.completedAt.slice(0, 10))}` : ""}
                 actions={
                   <>
                     <Button
                       type="button"
                       variant="outline"
                       size="sm"
                       disabled={patch.isPending}
                       onClick={() =>
                         patch.mutate(
                           { id: item.id, patch: { status: "aberta" } },
                           { onError: failed },
                         )
                       }
                     >
                       <RotateCcw aria-hidden /> Reabrir
                     </Button>
                     <Button
                       type="button"
                       variant="ghost"
                       size="sm"
                       onClick={() => void openLink("nota", item.path)}
                     >
                       Abrir nota
                     </Button>
                   </>
                 }
               />
             ))}
           </ul>
         )}
       </Panel>
     </div>
   )
 }
