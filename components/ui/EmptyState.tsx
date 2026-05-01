import Link from 'next/link'

interface Props {
  icon: string
  title: string
  description: string
  actionLabel?: string
  actionHref?: string
}

export default function EmptyState({ icon, title, description, actionLabel, actionHref }: Props) {
  return (
    <div className="cf-empty">
      <div className="cf-empty-illus">{icon}</div>
      <p className="cf-serif" style={{ fontSize: 24, fontWeight: 300, fontStyle: 'italic', marginBottom: 9 }}>{title}</p>
      <p style={{ fontSize: 13, color: 'var(--cf-muted)', lineHeight: 1.65, maxWidth: 360, marginBottom: 24 }}>{description}</p>
      {actionLabel && actionHref && (
        <Link href={actionHref}>
          <button className="button is-ink">{actionLabel}</button>
        </Link>
      )}
    </div>
  )
}
