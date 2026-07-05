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

import {
    fetchConversationList,
    fetchConversationPage,
    fetchFileResponse,
    fetchProjects,
    resolveFileDownload,
} from './api'

describe('fetchConversationPage', () => {
    afterEach(() => {
        vi.unstubAllGlobals()
    })

    it('loads one all-conversations page and reports the remaining pages', async () => {
        const items = Array.from({ length: 100 }, (_, index) => ({
            id: `conversation-${index}`,
            title: `Conversation ${index}`,
            create_time: index,
        }))
        const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ items, total: 250 })))
        vi.stubGlobal('fetch', fetchMock)

        const page = await fetchConversationPage(null)

        expect(page).toMatchObject({ nextOffset: 100, total: 250, hasMore: true })
        expect(fetchMock.mock.calls[0][0]).toContain('/conversations?limit=100&offset=0&order=updated&hide_snorlax=true')
    })

    it('continues a Project list with its API cursor', async () => {
        const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
            items: [{ id: 'project-chat', title: 'Project chat', create_time: 0 }],
            cursor: 'next-page-token',
        })))
        vi.stubGlobal('fetch', fetchMock)

        const page = await fetchConversationPage('project-id', undefined, { cursor: 'current-token' })

        expect(page).toMatchObject({ nextOffset: 1, nextCursor: 'next-page-token', hasMore: true })
        expect(fetchMock.mock.calls[0][0]).toContain(
            '/gizmos/project-id/conversations?limit=50&cursor=current-token',
        )
    })

    it('fails loudly when Project conversation pagination repeats a cursor', async () => {
        const page = JSON.stringify({
            items: [{ id: 'project-chat', title: 'Project chat', create_time: 0 }],
            cursor: 'same-token',
        })
        vi.stubGlobal('fetch', vi.fn()
            .mockResolvedValueOnce(new Response(page))
            .mockResolvedValueOnce(new Response(page)))

        await expect(fetchConversationList('project-id')).rejects.toThrow(
            'Conversation pagination repeated cursor: same-token',
        )
    })

    it('fails loudly when Project sidebar pagination repeats a cursor', async () => {
        const page = JSON.stringify({
            items: [{ id: 'project-id', name: 'Project' }],
            cursor: 'same-token',
        })
        vi.stubGlobal('fetch', vi.fn()
            .mockResolvedValueOnce(new Response(page))
            .mockResolvedValueOnce(new Response(page)))

        await expect(fetchProjects()).rejects.toThrow(
            'Project pagination repeated cursor: same-token',
        )
    })

    it('fails loudly when a Project sidebar item has no ID', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
            items: [{ name: 'Broken Project' }],
            cursor: null,
        }))))

        await expect(fetchProjects()).rejects.toThrow(
            'Project sidebar item missing ID at index 0',
        )
    })
})

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
