import type { ServiceJob } from "@/types"

/** A visit can carry up to this many photos. */
export const MAX_JOB_PHOTOS = 5

/** All photos on a visit, newest-format first. Older visits only have the
 * single `photoUrl`, or the retired before/after pair - those still show. */
export function jobPhotos(
  job: Pick<ServiceJob, "photoUrls" | "photoUrl" | "beforePhotoUrl" | "afterPhotoUrl">
): string[] {
  if (job.photoUrls?.length) return job.photoUrls
  if (job.photoUrl) return [job.photoUrl]
  return [job.beforePhotoUrl, job.afterPhotoUrl].filter((u): u is string => !!u)
}
