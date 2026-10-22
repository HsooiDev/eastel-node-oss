/** Quote a cell and keep customer-controlled formula syntax inert. */
export function csvText(value: unknown): string {
  let text = value == null ? '' : String(value)
  if (/^[\u0000-\u0020]*[=+\-@]/.test(text) || /^[\t\r\n]/.test(text)) text = `'${text}`
  return `"${text.replace(/"/g, '""')}"`
}
