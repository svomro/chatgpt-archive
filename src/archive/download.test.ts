import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { DiscoveredAsset } from './types'

const api = vi.hoisted(() => ({
    resolveFileDownload: vi.fn(),
    fetchFileResponse: vi.fn(),
}))

vi.mock('../chatgpt/api', () => ({
    ApiError: class ApiError extends Error {
        retryAfterMs = 0
    },
    resolveFileDownload: api.resolveFileDownload,
    fetchFileResponse: api.fetchFileResponse,
}))

import { downloadAsset } from './download'

class MemoryDirectory {
    files = new Map<string, Blob>()

    async getFileHandle(name: string, options?: { create?: boolean }) {
        if (!this.files.has(name) && !options?.create) {
            throw new DOMException('Missing', 'NotFoundError')
        }
        return {
            getFile: async () => {
                const blob = this.files.get(name) ?? new Blob()
                return new File([blob], name, { type: blob.type })
            },
            createWritable: async () => ({
                write: async (value: Blob) => { this.files.set(name, value) },
                close: async () => {},
            }),
        }
    }
}

function asset(overrides: Partial<DiscoveredAsset> = {}): DiscoveredAsset {
    return {
        key: 'file:file_00000000a95871f886ef247854b30b80',
        fileId: 'file_00000000a95871f886ef247854b30b80',
        aliases: [],
        directUrls: [],
        inlineDataUrl: null,
        sandboxPaths: [],
        names: ['screenshot.png'],
        mimeTypes: ['image/png'],
        expectedSizes: [4],
        references: [],
        ...overrides,
    }
}

describe('downloadAsset', () => {
    beforeEach(() => {
        api.resolveFileDownload.mockReset()
        api.fetchFileResponse.mockReset()
        api.resolveFileDownload.mockResolvedValue({
            status: 'success',
            download_url: 'https://files.oaiusercontent.com/signed',
            file_name: 'screenshot.png',
            file_size_bytes: 4,
            mime_type: 'image/png',
        })
    })

    it('verifies and reuses an existing file without downloading its bytes again', async () => {
        const folder = new MemoryDirectory()
        const name = 'screenshot_[file_00000000a95871f886ef247854b30b80].png'
        folder.files.set(name, new Blob(['data'], { type: 'image/png' }))

        const result = await downloadAsset(
            asset(),
            folder as unknown as FileSystemDirectoryHandle,
            new AbortController().signal,
        )

        expect(result.status).toBe('existing')
        expect(result.actualSize).toBe(4)
        expect(result.sha256).toHaveLength(64)
        expect(api.fetchFileResponse).not.toHaveBeenCalled()
    })

    it('downloads, hashes, and writes a missing file', async () => {
        const folder = new MemoryDirectory()
        api.fetchFileResponse.mockResolvedValue(new Response(new Blob(['data'], { type: 'image/png' })))

        const result = await downloadAsset(
            asset(),
            folder as unknown as FileSystemDirectoryHandle,
            new AbortController().signal,
        )

        expect(result.status).toBe('downloaded')
        expect(result.actualSize).toBe(4)
        expect(result.sha256).toHaveLength(64)
        expect(folder.files.has(result.localFile!)).toBe(true)
    })

    it('downloads an interpreter sandbox file without a file ID', async () => {
        const folder = new MemoryDirectory()
        api.fetchFileResponse.mockResolvedValue(new Response(new Blob(['<html></html>'], { type: 'text/html-file' })))
        const url = '/backend-api/conversation/conversation-id/interpreter/download?message_id=message-id&sandbox_path=%2Fmnt%2Fdata%2Fresult.html'

        const result = await downloadAsset(
            asset({
                key: 'sandbox:message-id:sandbox:/mnt/data/result.html',
                fileId: null,
                directUrls: [url],
                names: ['result.html'],
                mimeTypes: [],
                expectedSizes: [],
                sandboxPaths: ['sandbox:/mnt/data/result.html'],
            }),
            folder as unknown as FileSystemDirectoryHandle,
            new AbortController().signal,
        )

        expect(result.status).toBe('downloaded')
        expect(api.fetchFileResponse).toHaveBeenCalledWith(url, expect.any(AbortSignal))
        expect(folder.files.has(result.localFile!)).toBe(true)
    })

    it('keeps an unresolved sandbox path visible in the manifest', async () => {
        const folder = new MemoryDirectory()
        const result = await downloadAsset(
            asset({
                key: 'sandbox:sandbox:/mnt/data/missing.png',
                fileId: null,
                names: ['missing.png'],
                sandboxPaths: ['sandbox:/mnt/data/missing.png'],
            }),
            folder as unknown as FileSystemDirectoryHandle,
            new AbortController().signal,
        )

        expect(result.status).toBe('unresolved')
        expect(result.error).toContain('sandbox:/mnt/data/missing.png')
    })
})
