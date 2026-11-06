import type { TaskKey } from './types'

// The fixed list of jobs a gardener can tick off. Each key has an English and
// a Spanish label in i18n.ts, so every user sees them in their own language.
export const ALL_TASKS: TaskKey[] = [
  'mow', 'edge', 'trim', 'prune', 'blow', 'leaves',
  'weed', 'mulch', 'fertilize', 'water', 'patio', 'debris',
]
export const DEFAULT_TASKS: TaskKey[] = ['mow', 'trim', 'blow', 'water', 'patio']
