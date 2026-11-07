import type { Timestamp } from 'firebase/firestore'

export type Lang = 'en' | 'es'
export type Role = 'provider' | 'customer'

export interface Profile {
  uid: string
  role: Role
  language: Lang
  name: string
  email: string
  phone?: string
  address?: string
  providerId?: string // customers only: the gardener they work with
  inviteCode?: string // providers only: customers type this to link up
}

export interface ProviderProfile {
  name: string
  language?: Lang
  phone?: string
  zelle?: string
  venmo?: string
}

export type TaskKey =
  | 'mow' | 'edge' | 'trim' | 'blow' | 'water' | 'patio'
  | 'weed' | 'mulch' | 'fertilize' | 'prune' | 'leaves' | 'debris'

export interface JobTask { key: TaskKey; done: boolean }

export type PhotoTag = 'before' | 'after' | 'clean'
export interface JobPhoto { url: string; path: string; tag: PhotoTag }

export type JobStatus = 'pending' | 'in_progress' | 'done'

export interface Payment {
  status: 'unpaid' | 'paid'
  method?: 'zelle' | 'venmo'
  amount?: string
  note?: string
  paidAt?: Timestamp
}

export interface Job {
  id: string
  providerId: string
  customerId: string
  customerName: string
  address: string
  date: string // YYYY-MM-DD
  startTime: string // HH:MM
  endTime: string // HH:MM
  description: string
  descriptionLang: Lang
  descriptionTranslations?: Partial<Record<Lang, string>>
  tasks: JobTask[]
  status: JobStatus
  photos: JobPhoto[]
  note?: string
  noteLang?: Lang
  noteTranslations?: Partial<Record<Lang, string>>
  reportSentAt?: Timestamp
  payment: Payment
  createdAt?: Timestamp
}

export interface ChatMessage {
  id: string
  senderId: string
  text: string
  lang: Lang
  translations?: Partial<Record<Lang, string>>
  translationFailed?: boolean
  createdAt?: Timestamp
}

/** A customer the gardener added by hand. Becomes "linked" when that person signs up and enters its code. */
export interface CustomerRecord {
  id: string
  providerId: string
  name: string
  phone?: string
  address?: string
  language: Lang
  code: string
  claimedBy?: string
}

/** One row in the gardener's customer list: either a linked account or a hand-added record. */
export interface CustomerEntry {
  id: string // user uid when linked, record id otherwise (this is what a job stores as customerId)
  name: string
  phone?: string
  address?: string
  language?: Lang
  linked: boolean
  code?: string
}

export interface Invoice {
  id: string
  providerId: string
  providerName: string
  customerId: string
  customerName: string
  customerLang: Lang
  number: number
  amount: number
  period: string
  notes?: string
  status: 'unpaid' | 'paid'
  method?: 'zelle' | 'venmo'
  paidAt?: Timestamp
  /** copied at creation so the public invoice page never has to read the gardener's profile */
  zelle?: string
  venmo?: string
  createdAt?: Timestamp
}
