import { unsafeWindow } from 'vite-plugin-monkey/dist/client'
import type {
    AccountProfile,
    ArchiveCatalog,
    ConversationListItem,
    ConversationPage,
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
        if (!response.ok) throw new ApiError(`Account scope request failed: ${response.status}`, response.status)
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
        for (const [index, item] of (page.items ?? []).entries()) {
            const project = projectFromItem(item)
            if (!project) throw new Error(`Project sidebar item missing ID at index ${index}`)
            projects.push(project)
        }
        cursor = page.cursor ?? null
        if (cursor != null) {
            const key = String(cursor)
            if (seenCursors.has(key)) throw new Error(`Project pagination repeated cursor: ${key}`)
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
    const seenCursors = new Set<string>()

    while (true) {
        const page = await fetchConversationPage(projectId, signal, { archived, offset, cursor })
        items.push(...page.items)
        if (!page.hasMore) break

        offset = page.nextOffset
        cursor = page.nextCursor
        if (projectId && cursor != null) {
            const key = String(cursor)
            if (seenCursors.has(key)) throw new Error(`Conversation pagination repeated cursor: ${key}`)
            seenCursors.add(key)
        }
    }

    return items
}

export async function fetchConversationPage(
    projectId: string | null,
    signal?: AbortSignal,
    options: {
        archived?: boolean
        offset?: number
        cursor?: string | number | null
        limit?: number
    } = {},
): Promise<ConversationPage> {
    const limit = options.limit ?? (projectId ? 50 : 100)
    const offset = options.offset ?? 0
    const cursor = options.cursor ?? 0

    if (projectId) {
        const params = new URLSearchParams({ limit: String(limit), cursor: String(cursor) })
        const page = await fetchJson<{
            items?: ConversationListItem[]
            cursor?: string | number | null
        }>(`/gizmos/${encodeURIComponent(projectId)}/conversations?${params}`, signal)
        const items = page.items ?? []
        const nextCursor = page.cursor ?? null
        return {
            items,
            total: null,
            nextOffset: offset + items.length,
            nextCursor,
            hasMore: items.length > 0 && nextCursor != null,
        }
    }

    const params = new URLSearchParams({
        limit: String(limit),
        offset: String(offset),
        order: 'updated',
        hide_snorlax: 'true',
        ...(options.archived ? { is_archived: 'true' } : {}),
    })
    const page = await fetchJson<{
        items?: ConversationListItem[]
        total?: number | null
    }>(`/conversations?${params}`, signal)
    const items = page.items ?? []
    const total = page.total ?? null
    const nextOffset = offset + items.length
    return {
        items,
        total,
        nextOffset,
        nextCursor: null,
        hasMore: items.length > 0 && (total == null ? items.length >= limit : nextOffset < total),
    }
}

export async function fetchAllConversationRecords(
    projects: ProjectRecord[],
    signal?: AbortSignal,
): Promise<ConversationRecord[]> {
    const byId = new Map<string, ConversationRecord>()
    for (const item of await fetchConversationList(null, signal)) {
        byId.set(item.id, { item, project: null })
    }
    for (const item of await fetchConversationList(null, signal, true)) {
        byId.set(item.id, { item, project: null })
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

export async function fetchArchiveCatalog(signal?: AbortSignal): Promise<ArchiveCatalog> {
    const projects = await fetchProjects(signal)
    return {
        projects,
        records: await fetchAllConversationRecords(projects, signal),
    }
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
    try {
        return await fetchJson(`/files/download/${encodeURIComponent(fileId)}?${params}`, signal)
    }
    catch (error) {
        if (!(error instanceof ApiError) || error.status !== 404) throw error
        // Older user uploads are no longer resolved by the exporter's legacy
        // query. This is the endpoint the current ChatGPT attachment button uses.
        return fetchJson(
            `/files/download/${encodeURIComponent(fileId)}?download_intent=true`,
            signal,
        )
    }
}

export async function fetchFileResponse(
    url: string,
    signal?: AbortSignal,
    allowHtml = false,
): Promise<Response> {
    const parsedUrl = new URL(url, origin)
    const isBackendApi = parsedUrl.origin === origin && parsedUrl.pathname.startsWith('/backend-api/')
    const response = await fetch(url, {
        credentials: 'include',
        headers: isBackendApi ? await headers() : undefined,
        signal,
    })
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
        && !allowHtml
        && !isInterpreterDownload
        && !/\battachment\b/i.test(disposition)) {
        throw new Error('File endpoint returned HTML instead of an attachment')
    }
    return response
}
