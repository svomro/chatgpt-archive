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

    it('uses filesystem-safe ISO timestamps', () => {
        expect(timestampLabel('2026-07-04T00:42:35.000Z')).toBe('2026-07-04T00-42-35')
    })
})
