import { describe, expect, it } from 'vitest'
import type { DiscoveredAsset } from './types'
import { assetFileName, conversationFolderName, projectFolderName, timestampLabel } from './naming'

const asset: DiscoveredAsset = {
    key: 'file:file_00000000a95871f886ef247854b30b80',
    fileId: 'file_00000000a95871f886ef247854b30b80',
    aliases: [],
    directUrls: [],
    inlineDataUrl: null,
    sandboxPaths: [],
    names: ['截屏2026-06-29 14.54.14.png'],
    mimeTypes: ['image/png'],
    expectedSizes: [554567],
    referenceOnly: false,
    referenceOnlyReason: null,
    references: [{
        nodeId: 'node',
        messageId: 'message',
        messageRole: 'user',
        jsonPath: '$.mapping.node.message',
        kind: 'user-upload',
        rawValue: 'pointer',
    }],
}

describe('archive names', () => {
    it('keeps the readable original name and appends the stable file ID', () => {
        expect(assetFileName(asset)).toBe('截屏2026-06-29 14.54.14_[file_00000000a95871f886ef247854b30b80].png')
    })

    it('creates stable conversation and project folders', () => {
        expect(conversationFolderName({ id: 'conversation-id', title: 'A/B' }))
            .toBe('[Original]_[A_B]_[conversation-id]')
        expect(projectFolderName({ id: 'g-p-123', name: 'Work', description: '', raw: {} }))
            .toBe('[Project]_[Work]_[g-p-123]')
    })

    it('uses filesystem-safe local timestamps', () => {
        expect(timestampLabel('2026-07-04T00:42:35.000Z'))
            .toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}$/)
        const utc = Date.UTC(2026, 6, 4, 0, 42, 35)
        const expected = new Date(utc)
        const pad = (value: number) => String(value).padStart(2, '0')
        const local = `${expected.getFullYear()}-${pad(expected.getMonth() + 1)}-${pad(expected.getDate())}`
            + `T${pad(expected.getHours())}-${pad(expected.getMinutes())}-${pad(expected.getSeconds())}`
        expect(timestampLabel('2026-07-04T00:42:35.000Z')).toBe(local)
    })
})
