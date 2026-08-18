export function BrandMark({ compact = false }: { readonly compact?: boolean }) {
  return (
    <div className={`brand${compact ? ' brand--compact' : ''}`}>
      <img className="brand__mark" src="/logo.png" alt="和工作" />
      {!compact && (
        <span className="brand__wording">
          <strong>和工作</strong>
          <small>HE GONG ZUO</small>
        </span>
      )}
    </div>
  )
}
