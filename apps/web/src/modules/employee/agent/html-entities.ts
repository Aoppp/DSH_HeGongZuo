// React 会将文本节点安全转义；这里只将上游消息已编码的实体还原为可读文本，绝不插入 HTML。
const namedEntities: Record<string, string> = {
  amp: '&',
  apos: "'",
  gt: '>',
  lt: '<',
  quot: '"',
}

function numericEntity(value: string): string | null {
  const number = value[1]?.toLowerCase() === 'x'
    ? Number.parseInt(value.slice(2), 16)
    : Number.parseInt(value.slice(1), 10)
  if (!Number.isInteger(number) || number < 0 || number > 0x10ffff || (number >= 0xd800 && number <= 0xdfff)) return null
  return String.fromCodePoint(number)
}

export function decodeHtmlEntities(text: string): string {
  return text.replace(/&(#(?:x[0-9a-f]+|\d+)|amp|apos|gt|lt|quot);/gi, (entity, value: string) => {
    if (value.startsWith('#')) return numericEntity(value) ?? entity
    return namedEntities[value.toLowerCase()] ?? entity
  })
}
