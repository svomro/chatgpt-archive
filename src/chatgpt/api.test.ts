import { afterEach, describe, expect, it, vi } from 'vitest'

vi.hoisted(() => {
    Object.defineProperty(globalThis, 'location', {
        configurable: true,
        value: { origin: 'https://chatgpt.com' },
    })
    Object.defineProperty(globalThis, 'document', {
        configurable: true,
        value: { cookie: '' },
    })
})

vi.mock('vite-plugin-monkey/dist/client', () => ({ unsafeWindow: {} }))

import { fetchFileResponse } from './api'

describe('fetchFileResponse', () => {
    afterEach(() => {
        vi.unstubAllGlobals()
    })

    it('accepts HTML created by Code Interpreter', async () => {
        const response = new Response('<html>artifact</html>', {
            headers: { 'content-type': 'text/html' },
        })
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response))

        const result = await fetchFileResponse(
            '/backend-api/conversation/conversation-id/interpreter/download?message_id=message-id&sandbox_path=%2Fmnt%2Fdata%2Fartifact.html',
        )

        expect(result).toBe(response)
    })

    it('still rejects an HTML page returned by an ordinary file endpoint', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('<html>sign in</html>', {
            headers: { 'content-type': 'text/html' },
        })))

        await expect(fetchFileResponse('/backend-api/files/download/file-id')).rejects.toThrow(
            'returned HTML instead of an attachment',
        )
    })

    it('accepts an explicitly attached HTML upload', async () => {
        const response = new Response('<html>upload</html>', {
            headers: {
                'content-type': 'text/html',
                'content-disposition': 'attachment; filename="page.html"',
            },
        })
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response))

        expect(await fetchFileResponse('/backend-api/files/download/file-id')).toBe(response)
    })
})
