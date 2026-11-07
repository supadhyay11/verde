import type { JobStatus } from "@/types"
import { cn } from "@/lib/utils"

const STATUS_CONFIG: Record<
  JobStatus,
  { label: string; className: string; dotClassName: string }
> = {
  pending: {
    label: "Pending",
    className: "bg-warning/15 text-warning-foreground",
    dotClassName: "bg-warning",
  },
  "in-progress": {
    label: "In Progress",
    className: "bg-primary/10 text-primary",
    dotClassName: "bg-primary animate-pulse",
  },
  completed: {
    label: "Completed",
    className: "bg-success/15 text-success",
    dotClassName: "bg-success",
  },
  scheduled: {
    label: "Scheduled",
    className: "bg-secondary text-secondary-foreground",
    dotClassName: "bg-muted-foreground/50",
  },
}

export function StatusBadge({
  status,
  className,
}: {
  status: JobStatus
  className?: string
}) {
  const config = STATUS_CONFIG[status]
  return (
    <span
      className={cn(
        "inline-flex w-fit shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold tracking-wide",
        config.className,
        className
      )}
    >
      <span className={cn("size-1.5 rounded-full", config.dotClassName)} />
      {config.label}
    </span>
  )
}
