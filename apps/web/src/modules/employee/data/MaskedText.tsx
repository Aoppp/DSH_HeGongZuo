// 员工管理 / 敏感信息展示。
import { Eye, EyeOff } from 'lucide-react'
import { useState } from 'react'

import { maskValue, type MaskKind } from './employee-data'

interface MaskedTextProps {
  readonly value: string | null | undefined
  readonly kind: MaskKind
}

// 敏感字段默认脱敏展示，点击眼睛图标切换显示原文。
export function MaskedText({ value, kind }: MaskedTextProps) {
  const [revealed, setRevealed] = useState(false)
  const masked = maskValue(value, kind)
  if (masked === null) return <span>—</span>
  const text = revealed ? value!.trim() : masked
  const label = revealed ? '隐藏' : '显示完整'
  return (
    <span className="employee-masked">
      <span className="employee-masked__text">{text}</span>
      <button
        className="employee-masked__toggle"
        type="button"
        aria-label={label}
        title={label}
        onClick={() => setRevealed((current) => !current)}
      >
        {revealed ? <EyeOff size={13} /> : <Eye size={13} />}
      </button>
    </span>
  )
}
