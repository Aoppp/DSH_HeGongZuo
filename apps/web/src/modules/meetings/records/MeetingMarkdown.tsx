export function MeetingMarkdown({ text }: { readonly text: string }) {
  const lines = text.replaceAll('\r\n', '\n').split('\n')
  return <div className="meeting-markdown">{lines.map((line, index) => {
    if (line.startsWith('### ')) return <h3 key={index}>{line.slice(4)}</h3>
    if (line.startsWith('## ')) return <h2 key={index}>{line.slice(3)}</h2>
    if (line.startsWith('# ')) return <h1 key={index}>{line.slice(2)}</h1>
    if (/^[-*] /.test(line)) return <div className="meeting-markdown__bullet" key={index}>• <span>{line.slice(2)}</span></div>
    if (/^\d+\. /.test(line)) return <div className="meeting-markdown__bullet" key={index}>{line.match(/^\d+\./)?.[0]} <span>{line.replace(/^\d+\. /, '')}</span></div>
    return line ? <p key={index}>{line}</p> : <br key={index} />
  })}</div>
}
