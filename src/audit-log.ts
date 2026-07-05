export type AuditLogLevel = 'INFO' | 'WARN' | 'ERROR'

export type AuditLogFieldValue = string | number | boolean | null | undefined

export interface AuditLogEntry {
    timestamp: string
    level: AuditLogLevel
    event: string
    fields?: Record<string, AuditLogFieldValue>
}

function fieldLines(value: Exclude<AuditLogFieldValue, undefined>): string[] {
    if (value === null) return ['null']
    return String(value).replace(/\r\n?/g, '\n').split('\n')
}

export function formatAuditLogEntry(entry: AuditLogEntry): string {
    const lines = [`[${entry.timestamp}] ${entry.level} ${entry.event}`]
    for (const [key, value] of Object.entries(entry.fields ?? {})) {
        if (value === undefined) continue
        const values = fieldLines(value)
        if (values.length === 1) {
            lines.push(`  ${key}: ${values[0]}`)
            continue
        }
        lines.push(`  ${key}: |`)
        lines.push(...values.map(line => `    ${line}`))
    }
    return lines.join('\n')
}
