import { Sparkles } from 'lucide-react'

export function BrandMark({ compact = false }: { readonly compact?: boolean }) {
  return (
    <div className={`brand${compact ? ' brand--compact' : ''}`}>
      <span className="brand__mark" aria-hidden="true">
        <span />
        <span />
        <Sparkles size={13} />
      </span>
      {!compact && (
        <span className="brand__wording">
          <strong>和工作</strong>
          <small>HE GONG ZUO</small>
        </span>
      )}
    </div>
  )
}
