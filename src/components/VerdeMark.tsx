/**
 * Verde's logo mark: a two-leaf sprout. Drop-in for the old droplet icon -
 * it takes the same className and paints in the current text color.
 */
export function VerdeMark({ className }: { className?: string; fill?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      aria-hidden="true"
      fill="currentColor"
      stroke="none"
    >
      <path d="M11 13.5C5.2 13.9 2 10.3 2.2 5.4 7.6 5 11.2 8 11 13.5Z" />
      <path d="M12.6 11.6C12.2 5.6 15.6 1.9 21.8 2.2 22.2 8.4 18.6 12 12.6 11.6Z" />
      <path
        d="M12 22.2V11"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  )
}
