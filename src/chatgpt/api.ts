import { unsafeWindow } from 'vite-plugin-monkey/dist/client'
import type {
    AccountProfile,
    ConversationListItem,
    ConversationRecord,
    FileDownloadResponse,
    ProjectRecord,
    RawConversation,
} from './types'

const origin = location.origin
const apiBase = `${origin}/backend-api`

export class ApiError extends Error {
    constructor(
        message: string,
        readonly status: number,
        readonly retryAfterMs = 0,
    ) {
        super(message)
        this.name = 'ApiError'
    }
}

let sessionPromise: Promise<any> | null = null
let accountIdPromise: Promise<string | null> | null = null

function cookie(name: string): string {
    const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`))
    return match ? decodeURIComponent(match[1]) : ''
}

async function session(): Promise<any> {
    const pageSession = unsafeWindow?.__remixContext?.state?.loaderData?.root?.clientBootstrap?.session
        ?? unsafeWindow?.__NEXT_DATA__?.props?.pageProps
    if (pageSession?.accessToken && pageSession?.user) return pageSession

    sessionPromise ??= fetch(`${origin}/api/auth/session`, { credentials: 'include' }).then(async (response) => {
        if (!response.ok) throw new ApiError(`Session request failed: ${response.status}`, response.status)
        return response.json()
    })
    return sessionPromise
}

async function activeAccountId(accessToken: string): Promise<string | null> {
    accountIdPromise ??= (async () => {
        const workspace = cookie('_account')
        if (!workspace) return null
        const response = await fetch(`${apiBase}/accounts/check/v4-2023-04-27`, {
            credentials: 'include',
            headers: {
                Authorization: `Bearer ${accessToken}`,
                'X-Authorization': `Bearer ${accessToken}`,
            },
        })
        if (!response.ok) return null
        const payload = await response.json()
        return payload?.accounts?.[workspace]?.account?.account_id ?? null
    })()
    return accountIdPromise
}

async function headers(): Promise<Record<string, string>> {
    const currentSession = await session()
    const accessToken = currentSession.accessToken as string
    const accountId = await activeAccountId(accessToken)
    return {
        Authorization: `Bearer ${accessToken}`,
        'X-Authorization': `Bearer ${accessToken}`,
        ...(accountId ? { 'Chatgpt-Account-Id': accountId } : {}),
    }
}

function retryAfter(response: Response): number {
    const value = response.headers.get('retry-after')
    if (!value) return 0
    const seconds = Number.parseInt(value, 10)
    return Number.isFinite(seconds) ? seconds * 1000 : 0
}

function wait(milliseconds: number, signal?: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
        const timer = globalThis.setTimeout(resolve, milliseconds)
        signal?.addEventListener('abort', () => {
            globalThis.clearTimeout(timer)
            reject(signal.reason ?? new DOMException('Aborted', 'AbortError'))
        }, { once: true })
    })
}

async function fetchJson<T>(path: string, signal?: AbortSignal): Promise<T> {
    let lastError: unknown
    for (let attempt = 1; attempt <= 5; attempt += 1) {
        signal?.throwIfAborted()
        try {
            const response = await fetch(path.startsWith('http') ? path : `${apiBase}${path}`, {
                credentials: 'include',
                headers: await headers(),
                signal,
            })
            if (response.ok) return response.json() as Promise<T>

            const error = new ApiError(
                `${response.status} ${response.statusText}: ${path}`,
                response.status,
                retryAfter(response),
            )
            lastError = error
            const retryable = response.status === 408 || response.status === 429 || response.status >= 500
            if (!retryable || attempt === 5) throw error
            await wait(error.retryAfterMs || Math.min(1000 * 2 ** (attempt - 1), 15_000), signal)
        }
        catch (error) {
            lastError = error
            if (signal?.aborted || error instanceof ApiError || attempt === 5) throw error
            await wait(Math.min(1000 * 2 ** (attempt - 1), 15_000), signal)
        }
    }
    throw lastError
}

export async function getAccountProfile(): Promise<AccountProfile> {
    const currentSession = await session()
    const user = currentSession.user ?? {}
    return {
        id: String(user.id ?? ''),
        email: String(user.email ?? user.name ?? 'unknown-account'),
        name: String(user.name ?? ''),
        accountId: await activeAccountId(currentSession.accessToken),
    }
}

function projectFromItem(item: any): ProjectRecord | null {
    const project = item?.gizmo?.gizmo ?? item?.gizmo ?? item
    const id = project?.id
    if (typeof id !== 'string' || !id) return null
    return {
        id,
        name: String(project?.display?.name ?? project?.name ?? id),
        description: String(project?.display?.description ?? project?.description ?? ''),
        raw: item,
    }
}

export async function fetchProjects(signal?: AbortSignal): Promise<ProjectRecord[]> {
    const projects: ProjectRecord[] = []
    let cursor: string | number | null = null
    const seenCursors = new Set<string>()

    do {
        const params = new URLSearchParams({ conversations_per_gizmo: '0' })
        if (cursor != null) params.set('cursor', String(cursor))
        const page = await fetchJson<{ items?: unknown[]; cursor?: string | number | null }>(
            `/gizmos/snorlax/sidebar?${params}`,
            signal,
        )
        for (const item of page.items ?? []) {
            const project = projectFromItem(item)
            if (project) projects.push(project)
        }
        cursor = page.cursor ?? null
        if (cursor != null) {
            const key = String(cursor)
            if (seenCursors.has(key)) break
            seenCursors.add(key)
        }
    } while (cursor != null)

    return projects
}

export async function fetchConversationList(
    projectId: string | null,
    signal?: AbortSignal,
    archived = false,
): Promise<ConversationListItem[]> {
    const items: ConversationListItem[] = []
    let offset = 0
    let cursor: string | number | null = 0
    const limit = projectId ? 50 : 100
    const seenCursors = new Set<string>()

    while (true) {
        let page: { items?: ConversationListItem[]; total?: number | null; cursor?: string | null }
        if (projectId) {
            const params = new URLSearchParams({ limit: String(limit), cursor: String(cursor ?? 0) })
            page = await fetchJson(`/gizmos/${encodeURIComponent(projectId)}/conversations?${params}`, signal)
        }
        else {
            const params = new URLSearchParams({
                limit: String(limit),
                offset: String(offset),
                ...(archived ? { is_archived: 'true' } : {}),
            })
            page = await fetchJson(`/conversations?${params}`, signal)
        }

        const batch = page.items ?? []
        items.push(...batch)
        if (batch.length === 0) break

        if (projectId) {
            cursor = page.cursor ?? null
            if (cursor == null) break
            const key = String(cursor)
            if (seenCursors.has(key)) break
            seenCursors.add(key)
        }
        else {
            offset += limit
            if (page.total != null && offset >= page.total) break
            if (batch.length < limit) break
        }
    }

    return items
}

export async function fetchAllConversationRecords(
    projects: ProjectRecord[],
    signal?: AbortSignal,
): Promise<ConversationRecord[]> {
    const byId = new Map<string, ConversationRecord>()
    for (const item of await fetchConversationList(null, signal)) {
        byId.set(item.id, { item, project: null })
    }
    try {
        for (const item of await fetchConversationList(null, signal, true)) {
            byId.set(item.id, { item, project: null })
        }
    }
    catch (error) {
        // This private endpoint has changed before. Visible and Project chats
        // must still be archived even if an account does not expose this filter.
        console.warn('[ChatGPT Archive] archived conversation listing failed', error)
    }
    for (const project of projects) {
        for (const item of await fetchConversationList(project.id, signal)) {
            byId.set(item.id, { item, project })
        }
    }
    return [...byId.values()].sort((left, right) => {
        return toTimestamp(right.item.update_time ?? right.item.create_time)
            - toTimestamp(left.item.update_time ?? left.item.create_time)
    })
}

function toTimestamp(value: number | string | undefined): number {
    if (typeof value === 'number') return value * 1000
    if (typeof value === 'string') return Date.parse(value) || 0
    return 0
}

export async function fetchConversation(id: string, signal?: AbortSignal): Promise<RawConversation> {
    const raw = await fetchJson<RawConversation>(`/conversation/${encodeURIComponent(id)}`, signal)
    if (!raw.id) raw.id = id
    return raw
}

export async function resolveFileDownload(fileId: string, signal?: AbortSignal): Promise<FileDownloadResponse> {
    const params = new URLSearchParams({ post_id: '', inline: 'false' })
    return fetchJson(`/files/download/${encodeURIComponent(fileId)}?${params}`, signal)
}

export async function fetchFileResponse(url: string, signal?: AbortSignal): Promise<Response> {
    const response = await fetch(url, { credentials: 'include', signal })
    if (!response.ok) {
        throw new ApiError(
            `${response.status} ${response.statusText}: file download`,
            response.status,
            retryAfter(response),
        )
    }
    const contentType = (response.headers.get('content-type') ?? '').toLowerCase()
    const disposition = response.headers.get('content-disposition') ?? ''
    const isInterpreterDownload = url.includes('/interpreter/download?')
    if (contentType.includes('text/html')
        && !isInterpreterDownload
        && !/\battachment\b/i.test(disposition)) {
        throw new Error('File endpoint returned HTML instead of an attachment')
    }
    return response
}
