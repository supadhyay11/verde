// Shared task-list definitions used by both the "schedule a new visit" form
// (AssignJobPage) and the in-progress job screen (JobDetailPage), so the two
// stay in sync and a recurring job's auto-scheduled next visit always starts
// from the same base checklist.

export const BASE_TASKS: { id: string; label: string }[] = [
  { id: "t1", label: "Mow, edge and trim lawn" },
  { id: "t2", label: "Clear leaves and debris" },
  { id: "t3", label: "Weed beds and prune plants" },
]

// Optional extra checklist items a provider can add on top of the base
// tasks - either while scheduling a visit or later from the job itself.
// These are per-job only: adding one to a job never changes what future
// jobs start with (see firebase-jobs-store's recurrence handling, which
// always reseeds the next occurrence from BASE_TASKS, not the completed
// job's full task list).
export const STANDARD_EXTRA_TASKS: {
  id: string
  label: string
  /** Only offered for properties with hasSpa set. */
  spaOnly?: boolean
}[] = [
  { id: "weeds", label: "Weed control" },
  { id: "mulch", label: "Add mulch" },
  { id: "water", label: "Water and fertilize" },
  { id: "hedge", label: "Trim hedges" },
  { id: "leaf", label: "Leaf cleanup" },
]

export function extraTasksFor(hasSpa: boolean | undefined) {
  return STANDARD_EXTRA_TASKS.filter((t) => !t.spaOnly || hasSpa)
}
