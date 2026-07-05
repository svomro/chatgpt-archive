import { describe, expect, it } from 'vitest'
import { formatAuditLogEntry } from '../audit-log'

describe('audit log formatting', () => {
    it('formats a copyable multi-line event block', () => {
        const output = formatAuditLogEntry({
            timestamp: '2026-07-05T04:30:00.000Z',
            level: 'INFO',
            event: 'archive.complete',
            fields: { runId: 'run-123', selected: 2, complete: true },
        })
        expect(output).toBe('[2026-07-05T04:30:00.000Z] INFO archive.complete\n  runId: run-123\n  selected: 2\n  complete: true')
    })

    it('indents values containing newlines and omits undefined fields', () => {
        const output = formatAuditLogEntry({
            timestamp: '2026-07-05T04:30:00.000Z',
            level: 'ERROR',
            event: 'archive.error',
            fields: { message: 'first line\nsecond line', optional: undefined },
        })
        expect(output).toContain('  message: |\n    first line\n    second line')
        expect(output).not.toContain('optional')
    })
})
