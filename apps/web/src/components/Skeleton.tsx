import type { CSSProperties } from 'react'

import './skeleton.css'

type SkeletonShape = 'text' | 'avatar' | 'block'

export function Skeleton({ className = '', shape = 'block', width, height }: {
  readonly className?: string
  readonly shape?: SkeletonShape
  readonly width?: CSSProperties['width']
  readonly height?: CSSProperties['height']
}) {
  return <span className={`skeleton skeleton--${shape}${className ? ` ${className}` : ''}`} style={{ width, height }} aria-hidden="true" />
}

export function SkeletonText({ lines = 1 }: { readonly lines?: number }) {
  return <div className="skeleton-text" aria-hidden="true">{Array.from({ length: lines }, (_, index) => <Skeleton key={index} shape="text" width={index === lines - 1 && lines > 1 ? '64%' : index % 2 ? '82%' : '100%'} />)}</div>
}

export function SkeletonCards({ count = 4 }: { readonly count?: number }) {
  return <div className="skeleton-cards" role="status" aria-label="正在加载内容">{Array.from({ length: count }, (_, index) => <article className="skeleton-card" key={index}><div><Skeleton shape="text" width="42%" /><Skeleton shape="avatar" width={34} height={34} /></div><Skeleton height={30} width="34%" /><Skeleton shape="text" width="70%" /></article>)}</div>
}

export function SkeletonTable({ columns = 6, rows = 6, header = true }: { readonly columns?: number; readonly rows?: number; readonly header?: boolean }) {
  return <div className="skeleton-table" role="status" aria-label="正在加载表格">{header && <div className="skeleton-table__row skeleton-table__head">{Array.from({ length: columns }, (_, index) => <Skeleton shape="text" width={index === 0 ? '58%' : '72%'} key={index} />)}</div>}{Array.from({ length: rows }, (_, row) => <div className="skeleton-table__row" key={row}>{Array.from({ length: columns }, (_, column) => <div className="skeleton-table__cell" key={column}>{column === 0 && <Skeleton shape="avatar" width={30} height={30} />}<Skeleton shape="text" width={`${56 + (row + column) % 4 * 10}%`} />{column < 2 && <Skeleton shape="text" width="46%" />}</div>)}</div>)}</div>
}

export function SkeletonList({ count = 5, avatar = false }: { readonly count?: number; readonly avatar?: boolean }) {
  return <div className={`skeleton-list${avatar ? ' skeleton-list--avatar' : ''}`} role="status" aria-label="正在加载列表">{Array.from({ length: count }, (_, index) => <article key={index}>{avatar && <Skeleton shape="avatar" width={38} height={38} />}<div><Skeleton shape="text" width={`${48 + index % 3 * 12}%`} /><Skeleton shape="text" width={`${70 + index % 2 * 16}%`} /></div><Skeleton shape="text" width={72} /></article>)}</div>
}

export function SkeletonDetail() {
  return <div className="skeleton-detail" role="status" aria-label="正在加载详情"><Skeleton shape="text" width="28%" height={20} /><SkeletonText lines={3} /><Skeleton shape="text" width="22%" height={20} /><SkeletonText lines={5} /></div>
}
