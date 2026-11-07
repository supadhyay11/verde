import type { ButtonHTMLAttributes, ChangeEvent, FocusEvent, InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from 'react'
import { Link, NavLink, useNavigate } from 'react-router-dom'
import { ArrowLeft, CalendarDays, Leaf, MessageSquare, ClipboardList, UserRound, Users } from 'lucide-react'
import { useApp } from '@/lib/app-context'

export function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(' ')
}

/** Phone-width column with the Verde top bar and optional bottom navigation. */
export function Screen({
  children, nav = true, title, back, right,
}: { children: ReactNode; nav?: boolean; title?: string; back?: string | (() => void); right?: ReactNode }) {
  const navigate = useNavigate()
  const { t } = useApp()
  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col bg-bg">
      <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-line bg-bg/95 px-5 pb-3 pt-[calc(0.75rem+env(safe-area-inset-top))] backdrop-blur">
        {back ? (
          <button
            type="button"
            onClick={() => (typeof back === 'string' ? navigate(back) : back())}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-sand text-ink"
            aria-label={t('back')}
          >
            <ArrowLeft size={22} />
          </button>
        ) : (
          <Leaf size={26} className="shrink-0 text-green" aria-hidden />
        )}
        <h1 className="min-w-0 flex-1 truncate text-xl font-extrabold text-green">{title ?? 'Verde'}</h1>
        {right}
      </header>
      <main className={cx('flex-1 px-5 pt-5', nav ? 'pb-32' : 'pb-10')}>{children}</main>
      {nav && <BottomNav />}
    </div>
  )
}

function BottomNav() {
  const { profile, t } = useApp()
  const items =
    profile?.role === 'provider'
      ? [
          { to: '/', icon: ClipboardList, label: t('todaysJobs'), end: true },
          { to: '/customers', icon: Users, label: t('customers') },
          { to: '/messages', icon: MessageSquare, label: t('messages') },
          { to: '/schedule', icon: CalendarDays, label: t('schedule') },
          { to: '/profile', icon: UserRound, label: t('profile') },
        ]
      : [
          { to: '/', icon: ClipboardList, label: t('jobs'), end: true },
          { to: '/chat', icon: MessageSquare, label: t('messages') },
          { to: '/profile', icon: UserRound, label: t('profile') },
        ]
  return (
    <nav className="fixed inset-x-0 bottom-0 z-20 mx-auto max-w-md border-t border-line bg-bg/95 px-3 pb-[calc(0.5rem+env(safe-area-inset-bottom))] pt-2 backdrop-blur">
      <ul className="flex gap-2">
        {items.map(({ to, icon: Icon, label, end }) => (
          <li key={to} className="min-w-0 flex-1">
            <NavLink
              to={to}
              end={end}
              className={({ isActive }) =>
                cx(
                  'flex h-16 flex-col items-center justify-center gap-0.5 rounded-2xl text-sm font-bold',
                  isActive ? 'bg-green-soft text-green-dark ring-2 ring-green' : 'bg-surface text-ink ring-1 ring-line',
                )
              }
            >
              <Icon size={22} aria-hidden />
              <span className="max-w-full truncate px-1">{label}</span>
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  )
}

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost'
  icon?: ReactNode
}

/** 64px-tall, full-width by default: easy to hit with a gloved thumb. */
export function Button({ variant = 'primary', icon, className, children, ...rest }: BtnProps) {
  return (
    <button
      type="button"
      {...rest}
      className={cx(
        'flex min-h-16 w-full items-center justify-center gap-2 rounded-2xl px-5 text-xl font-bold transition-transform active:scale-[.98]',
        variant === 'primary' && 'bg-green text-white shadow-md active:bg-green-dark',
        variant === 'secondary' && 'bg-surface text-green-dark ring-2 ring-green',
        variant === 'danger' && 'bg-surface text-danger ring-2 ring-danger',
        variant === 'ghost' && 'bg-sand text-ink',
        className,
      )}
    >
      {icon}
      {children}
    </button>
  )
}

type FieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'onBlur'> & {
  label: string
  hint?: string
  error?: string
  multiline?: boolean
  id: string
  onChange?: (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void
  onBlur?: (e: FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => void
}

export function Field({ label, hint, error, multiline, id, ...rest }: FieldProps) {
  const cls = cx(
    'w-full rounded-2xl border-2 bg-surface px-4 text-xl text-ink placeholder:text-muted/70',
    error ? 'border-danger' : 'border-line focus:border-green',
    multiline ? 'min-h-32 py-3' : 'h-16',
  )
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-lg font-bold">{label}</label>
      {multiline ? (
        <textarea id={id} className={cls} {...(rest as unknown as TextareaHTMLAttributes<HTMLTextAreaElement>)} />
      ) : (
        <input id={id} className={cls} {...(rest as unknown as InputHTMLAttributes<HTMLInputElement>)} />
      )}
      {hint && !error && <p className="text-base text-muted">{hint}</p>}
      {error && <p role="alert" className="text-base font-semibold text-danger">{error}</p>}
    </div>
  )
}

export function Pill({ tone = 'neutral', children }: { tone?: 'neutral' | 'green' | 'solid'; children: ReactNode }) {
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-base font-bold',
        tone === 'neutral' && 'bg-sand text-muted',
        tone === 'green' && 'bg-green-soft text-green-dark',
        tone === 'solid' && 'bg-green text-white',
      )}
    >
      {children}
    </span>
  )
}

export function Empty({ title, help, action }: { title: string; help?: string; action?: ReactNode }) {
  return (
    <div className="mt-8 flex flex-col items-center gap-3 rounded-3xl border-2 border-dashed border-line px-6 py-10 text-center">
      <Leaf size={36} className="text-green" aria-hidden />
      <h2 className="text-2xl font-extrabold">{title}</h2>
      {help && <p className="text-lg text-muted">{help}</p>}
      {action && <div className="mt-2 w-full">{action}</div>}
    </div>
  )
}

export function Loading({ label }: { label: string }) {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-bg text-xl font-semibold text-muted">
      <Leaf className="mr-2 animate-pulse text-green" aria-hidden /> {label}
    </div>
  )
}

export function Card({ children, className, to }: { children: ReactNode; className?: string; to?: string }) {
  const cls = cx('block rounded-3xl border border-line bg-surface p-5 shadow-sm', className)
  return to ? <Link to={to} className={cls}>{children}</Link> : <div className={cls}>{children}</div>
}
