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

vi.mock('vite-plugin-monkey/dist/client', () => ({
    unsafeWindow: {
        __remixContext: {
            state: {
                loaderData: {
                    root: {
                        clientBootstrap: {
                            session: {
                                accessToken: 'test-token',
                                user: { id: 'user-id', email: 'test@example.com' },
                            },
                        },
                    },
                },
            },
        },
    },
}))

import { fetchFileResponse, resolveFileDownload } from './api'

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
        expect(fetch).toHaveBeenCalledWith(
            expect.stringContaining('/interpreter/download?'),
            expect.objectContaining({
                headers: expect.objectContaining({ Authorization: 'Bearer test-token' }),
            }),
        )
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

    it('accepts HTML reached through an authenticated download descriptor', async () => {
        const response = new Response('<html>artifact</html>', {
            headers: { 'content-type': 'text/html' },
        })
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response))

        expect(await fetchFileResponse(
            '/backend-api/estuary/content?id=generated-file',
            undefined,
            true,
        )).toBe(response)
    })

    it('retries old uploads with the current download-intent endpoint', async () => {
        const download = {
            status: 'success',
            download_url: 'https://files.oaiusercontent.com/signed',
            file_name: 'old-upload.mov',
            file_size_bytes: 123,
            mime_type: 'video/quicktime',
        }
        const fetchMock = vi.fn()
            .mockResolvedValueOnce(new Response('', { status: 404, statusText: 'Not Found' }))
            .mockResolvedValueOnce(new Response(JSON.stringify(download), {
                headers: { 'content-type': 'application/json' },
            }))
        vi.stubGlobal('fetch', fetchMock)

        await expect(resolveFileDownload('file_older_upload')).resolves.toEqual(download)
        expect(fetchMock).toHaveBeenCalledTimes(2)
        expect(fetchMock.mock.calls[1][0]).toContain('/files/download/file_older_upload?download_intent=true')
    })
})
