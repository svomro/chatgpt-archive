import { describe, expect, it } from 'vitest'
import type { RawConversation } from '../chatgpt/types'
import { discoverAssets } from './discover'

function conversation(messages: Record<string, any>): RawConversation {
    return {
        id: 'conversation-1',
        title: 'Fixture',
        mapping: Object.fromEntries(Object.entries(messages).map(([id, message]) => [id, {
            id,
            children: [],
            message: {
                id,
                author: { role: message.role ?? 'assistant', name: message.authorName ?? null },
                content: message.content ?? { content_type: 'text', parts: [''] },
                metadata: message.metadata ?? {},
            },
        }])),
    }
}

describe('discoverAssets', () => {
    it('deduplicates a user upload found in metadata and multimodal content', () => {
        const fileId = 'file_00000000a95871f886ef247854b30b80'
        const assets = discoverAssets(conversation({
            user: {
                role: 'user',
                content: {
                    content_type: 'multimodal_text',
                    parts: [{
                        content_type: 'image_asset_pointer',
                        asset_pointer: `sediment://${fileId}`,
                        size_bytes: 554567,
                    }, '有点惨'],
                },
                metadata: {
                    attachments: [{
                        id: fileId,
                        name: '截屏2026-06-29 14.54.14.png',
                        mime_type: 'image/png',
                        size: 554567,
                        source: 'local',
                    }],
                },
            },
        }))

        expect(assets).toHaveLength(1)
        expect(assets[0].fileId).toBe(fileId)
        expect(assets[0].names).toContain('截屏2026-06-29 14.54.14.png')
        expect(assets[0].expectedSizes).toContain(554567)
        expect(assets[0].references.some(reference => reference.kind === 'user-upload')).toBe(true)
    })

    it('collects generated images from every branch, not only current_node', () => {
        const first = 'file_00000000111111111111111111111111'
        const second = 'file_00000000222222222222222222222222'
        const assets = discoverAssets(conversation({
            branchA: {
                content: {
                    content_type: 'multimodal_text',
                    parts: [{
                        content_type: 'image_asset_pointer',
                        asset_pointer: `sediment://${first}`,
                        metadata: { generation: { prompt: 'fixture' } },
                    }],
                },
            },
            branchB: {
                metadata: { image_gen: { title: 'alternate' } },
                content: { content_type: 'multimodal_text', parts: [{ content_type: 'image_asset_pointer', asset_pointer: `sediment://${second}` }] },
            },
        }))

        expect(assets.map(asset => asset.fileId).sort()).toEqual([first, second])
        expect(assets.every(asset => asset.references.some(reference => reference.kind === 'generated-image'))).toBe(true)
    })

    it('finds Code Interpreter images in messages and encoded Jupyter payloads', () => {
        const first = 'file_00000000333333333333333333333333'
        const second = 'file_00000000444444444444444444444444'
        const assets = discoverAssets(conversation({
            tool: {
                role: 'tool',
                content: { content_type: 'execution_output', text: 'done' },
                metadata: {
                    aggregate_result: {
                        messages: [{ message_type: 'image', image_url: `file-service://${first}` }],
                        jupyter_messages: [{
                            content: {
                                data: {
                                    'image/vnd.openai.fileservice2.png': JSON.stringify({ url: `sediment://${second}`, image_width: 900 }),
                                },
                            },
                        }],
                    },
                },
            },
        }))

        expect(assets.map(asset => asset.fileId).sort()).toEqual([first, second])
        expect(assets.every(asset => asset.references.some(reference => reference.kind === 'cot-output'))).toBe(true)
    })

    it('finds image inputs, masks, targeted replies, audio, and library aliases', () => {
        const original = 'file_00000000555555555555555555555555'
        const mask = 'file_00000000666666666666666666666666'
        const targeted = 'file_00000000777777777777777777777777'
        const audio = 'file_00000000888888888888888888888888'
        const upload = 'file_00000000999999999999999999999999'
        const library = 'libfile_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
        const assets = discoverAssets(conversation({
            assistant: {
                content: {
                    content_type: 'multimodal_text',
                    parts: [{
                        content_type: 'audio_asset_pointer',
                        audio_asset_pointer: { asset_pointer: `sediment://${audio}` },
                    }, `Earlier library reference: ${library}`],
                },
                metadata: {
                    image_gen: { from_client: { operation: { original_file_id: original, mask_file_id: mask } } },
                    targeted_reply: `![Image](sediment://${targeted})`,
                    attachments: [{ id: upload, library_file_id: library, name: 'notes.pdf', mime_type: 'application/pdf' }],
                },
            },
        }))

        expect(new Set(assets.map(asset => asset.fileId))).toEqual(new Set([original, mask, targeted, audio, upload]))
        expect(assets.find(asset => asset.fileId === upload)?.aliases).toContain(library)
        expect(assets.find(asset => asset.fileId === audio)?.references.some(reference => reference.kind === 'audio')).toBe(true)
    })

    it('merges a sandbox link with a uniquely named downloadable attachment', () => {
        const fileId = 'file_00000000bbbbbbbbbbbbbbbbbbbbbbbb'
        const assets = discoverAssets(conversation({
            assistant: {
                content: { content_type: 'text', parts: ['[Download](sandbox:/mnt/data/report.csv)'] },
                metadata: { attachments: [{ id: fileId, name: 'report.csv', mime_type: 'text/csv' }] },
            },
        }))

        expect(assets).toHaveLength(1)
        expect(assets[0].fileId).toBe(fileId)
        expect(assets[0].sandboxPaths).toEqual(['sandbox:/mnt/data/report.csv'])
        expect(assets[0].directUrls[0]).toContain('/interpreter/download?')
        expect(assets[0].directUrls[0]).toContain('sandbox_path=%2Fmnt%2Fdata%2Freport.csv')
    })

    it('keeps same-named interpreter outputs from different messages separate', () => {
        const raw = conversation({
            first: {
                id: 'message-first',
                content: { content_type: 'text', parts: ['[Download](sandbox:/mnt/data/result.html)'] },
            },
            second: {
                id: 'message-second',
                content: { content_type: 'text', parts: ['[Download](sandbox:/mnt/data/result.html)'] },
            },
        })
        raw.id = 'conversation-id'

        const assets = discoverAssets(raw)

        expect(assets).toHaveLength(2)
        expect(new Set(assets.map(asset => asset.references[0].messageId))).toEqual(
            new Set(['first', 'second']),
        )
        expect(assets.every(asset => asset.directUrls[0].includes('/interpreter/download?'))).toBe(true)
    })

    it('tries a file download for every attachment fileId, not just user uploads', () => {
        const fileId = 'file-Rr1PVHG415YN75v7gBsnhf'
        const assets = discoverAssets(conversation({
            assistant: {
                role: 'assistant',
                metadata: {
                    attachments: [{ id: fileId, name: 'context.txt', mimeType: 'text/plain' }],
                },
            },
        }))

        expect(assets).toHaveLength(1)
        expect(assets[0].fileId).toBe(fileId)
        expect(assets[0].referenceOnly).toBe(false)
    })

    it('downloads system-role project sources via the file API', () => {
        const projectSource = 'file_00000000110071f89042f5f126b1b188'
        const assets = discoverAssets(conversation({
            systemAttachments: {
                role: 'system',
                metadata: {
                    attachments: [{
                        id: projectSource,
                        name: 'CC反代结构图.txt',
                        mimeType: 'text/plain',
                    }],
                },
            },
        }))

        expect(assets).toHaveLength(1)
        expect(assets[0].fileId).toBe(projectSource)
        expect(assets[0].referenceOnly).toBe(false)
    })

    it('adds an interpreter fallback URL for container.open_image attachments', () => {
        const fileId = 'file_00000000d36471fdabff201fa0a7ca47'
        const raw = conversation({
            openImage: {
                role: 'tool',
                authorName: 'container.open_image',
                metadata: {
                    attachments: [{
                        id: fileId,
                        size: 63691,
                        name: 'user-WgXfzTGko6pwYStjmyneowpF/12ba432eb1ee4470a2a0462396ea65dc/mnt/data/variants.png',
                        mime_type: null,
                    }],
                },
            },
        })
        raw.id = 'conv-cot'

        const assets = discoverAssets(raw)
        expect(assets).toHaveLength(1)
        expect(assets[0].fileId).toBe(fileId)
        expect(assets[0].referenceOnly).toBe(false)
        expect(assets[0].directUrls.some(url => url.includes('/interpreter/download?'))).toBe(true)
        expect(assets[0].directUrls[0]).toContain('sandbox_path=%2Fmnt%2Fdata%2Fvariants.png')
    })

    it('keeps assets with no fileId and no bytes as reference-only', () => {
        const assets = discoverAssets(conversation({
            assistant: {
                role: 'assistant',
                metadata: {
                    attachments: [{ id: 'attach-no-file', name: 'unresolvable.txt' }],
                },
            },
        }))

        expect(assets).toHaveLength(1)
        expect(assets[0].fileId).toBeNull()
        expect(assets[0].referenceOnly).toBe(true)
        expect(assets[0].referenceOnlyReason).toContain('No fileId')
    })

    it('keeps a file downloadable when it has a direct URL', () => {
        const fileId = 'file-Rr1PVHG415YN75v7gBsnhf'
        const assets = discoverAssets(conversation({
            assistant: {
                role: 'assistant',
                metadata: {
                    attachments: [{
                        id: fileId,
                        name: 'context.txt',
                        download_url: `https://files.oaiusercontent.com/files/${fileId}/download`,
                    }],
                },
            },
        }))

        expect(assets).toHaveLength(1)
        expect(assets[0].directUrls).toHaveLength(1)
        expect(assets[0].referenceOnly).toBe(false)
    })

    it('keeps a file downloadable when the user uploaded it', () => {
        const fileId = 'file-Rr1PVHG415YN75v7gBsnhf'
        const assets = discoverAssets(conversation({
            assistant: {
                role: 'assistant',
                metadata: { attachments: [{ id: fileId, name: 'context.txt' }] },
            },
            user: {
                role: 'user',
                metadata: { attachments: [{ id: fileId, name: 'context.txt' }] },
            },
        }))

        expect(assets).toHaveLength(1)
        expect(assets[0].fileId).toBe(fileId)
        expect(assets[0].references.some(reference => reference.kind === 'user-upload')).toBe(true)
        expect(assets[0].referenceOnly).toBe(false)
    })

    it('ignores sediment/file-service pointers that are template placeholders', () => {
        const realId = 'file_000000001234567890abcdef12345678'
        const assets = discoverAssets(conversation({
            tool: {
                role: 'tool',
                authorName: 'file_search',
                content: {
                    content_type: 'multimodal_text',
                    parts: [
                        'Cite the source using sediment://${fileId} in your reply.',
                        `Real reference: sediment://${realId}`,
                    ],
                },
            },
        }))

        expect(assets).toHaveLength(1)
        expect(assets[0].fileId).toBe(realId)
    })

    it('does not mirror arbitrary external web images', () => {
        const assets = discoverAssets(conversation({
            assistant: {
                content: { content_type: 'text', parts: ['https://example.com/image.png'] },
                metadata: { content_references: [{ url: 'https://cdn.shopify.com/image.jpg' }] },
            },
        }))
        expect(assets).toEqual([])
    })
})
