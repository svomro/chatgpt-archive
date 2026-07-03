import type { ProjectRecord, RawConversation, RawMessage } from '../chatgpt/types'
import type { AssetKind, AssetReference, DiscoveredAsset } from './types'

const FILE_ID_RE = /(?<![A-Za-z0-9])(?:file_[A-Za-z0-9]{16,}|file-(?!service\b)[A-Za-z0-9]{16,})/gi
const LIBRARY_ID_RE = /libfile_[A-Za-z0-9]{16,}/gi
const POINTER_RE = /(?:sediment|file-service):\/\/[^\s\])}"']+/gi
const MY_FILES_RE = /file:\/\/my_files\/[^\s\])}"']+/gi
const SANDBOX_RE = /sandbox:\/[^\s\])}"']+/gi
const DATA_IMAGE_RE = /data:image\/[A-Za-z0-9.+-]+;base64,[A-Za-z0-9+/=\s]+/gi
const FIRST_PARTY_URL_RE = /https:\/\/[^\s\])}"']+/gi

interface Hints {
    name?: string
    mimeType?: string
    expectedSize?: number
}

interface MessageContext {
    nodeId: string
    messageId: string
    role: string
    generatedMessage: boolean
}

interface MutableAsset extends DiscoveredAsset {
    aliasSet: Set<string>
    directUrlSet: Set<string>
    sandboxPathSet: Set<string>
    nameSet: Set<string>
    mimeTypeSet: Set<string>
    expectedSizeSet: Set<number>
    referenceSet: Set<string>
}

function strings(value: unknown): string[] {
    return typeof value === 'string' && value.trim() ? [value.trim()] : []
}

function number(value: unknown): number | undefined {
    return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined
}

function hintsFromObject(value: Record<string, unknown>, inherited: Hints): Hints {
    const name = strings(value.name)[0]
        ?? strings(value.file_name)[0]
        ?? strings(value.filename)[0]
        ?? inherited.name
    const mimeType = strings(value.mime_type)[0]
        ?? strings(value.mimetype)[0]
        ?? strings(value.media_type)[0]
        ?? inherited.mimeType
    const expectedSize = number(value.size_bytes)
        ?? number(value.file_size_bytes)
        ?? number(value.file_size)
        ?? number(value.size)
        ?? inherited.expectedSize
    return { name, mimeType, expectedSize }
}

function classify(path: string, context: MessageContext): AssetKind {
    const lower = path.toLowerCase()
    if (lower.includes('audio_asset_pointer')) return 'audio'
    if (lower.includes('video_container_asset_pointer') || lower.includes('frames_asset_pointers')) return 'video'
    if (lower.includes('aggregate_result') || lower.includes('jupyter_messages')) return 'cot-output'
    if (lower.includes('image_gen') || lower.includes('.dalle')) return 'image-input'
    if (lower.includes('library_file_id') || lower.includes('file_search') || lower.includes('citation')) return 'library-file'
    if (lower.includes('.metadata.attachments[') && context.role === 'user') return 'user-upload'
    if (lower.includes('asset_pointer') && context.generatedMessage) return 'generated-image'
    if (lower.includes('sandbox:')) return 'sandbox-file'
    return 'attachment'
}

function hashText(value: string): string {
    let hash = 2166136261
    for (let index = 0; index < value.length; index += 1) {
        hash ^= value.charCodeAt(index)
        hash = Math.imul(hash, 16777619)
    }
    return (hash >>> 0).toString(16).padStart(8, '0')
}

function basename(value: string): string {
    const clean = value.split(/[?#]/, 1)[0]
    return clean.slice(clean.lastIndexOf('/') + 1)
}

function isFirstPartyFileUrl(value: string): boolean {
    try {
        const host = new URL(value).hostname.toLowerCase()
        return host.endsWith('.oaiusercontent.com')
            || host === 'files.oaiusercontent.com'
            || host.endsWith('.openai.com') && value.includes('/files/')
    }
    catch {
        return false
    }
}

function generatedMessage(message: RawMessage): boolean {
    const metadata = message.metadata ?? {}
    const parts = Array.isArray(message.content?.parts) ? message.content.parts : []
    return metadata.async_task_type === 'image_gen'
        || metadata.image_gen != null
        || metadata.dalle != null
        || message.author?.name === 'dalle'
        || message.author?.name === 'image_gen'
        || parts.some((part) => {
            if (!part || typeof part !== 'object') return false
            const partMetadata = (part as Record<string, unknown>).metadata
            return !!partMetadata && typeof partMetadata === 'object'
                && ('generation' in partMetadata || 'dalle' in partMetadata)
        })
}

export function discoverAssets(conversation: RawConversation): DiscoveredAsset[] {
    const assets = new Map<string, MutableAsset>()
    const aliasToKey = new Map<string, string>()
    const conversationId = String(conversation.id ?? conversation.conversation_id ?? '')

    const getAsset = (key: string, fileId: string | null): MutableAsset => {
        const canonicalKey = aliasToKey.get(key) ?? key
        let asset = assets.get(canonicalKey)
        if (!asset) {
            asset = {
                key: canonicalKey,
                fileId,
                aliases: [],
                directUrls: [],
                inlineDataUrl: null,
                sandboxPaths: [],
                names: [],
                mimeTypes: [],
                expectedSizes: [],
                references: [],
                aliasSet: new Set(),
                directUrlSet: new Set(),
                sandboxPathSet: new Set(),
                nameSet: new Set(),
                mimeTypeSet: new Set(),
                expectedSizeSet: new Set(),
                referenceSet: new Set(),
            }
            assets.set(canonicalKey, asset)
        }
        return asset
    }

    const mergeAsset = (target: MutableAsset, source: MutableAsset) => {
        source.aliasSet.forEach(value => target.aliasSet.add(value))
        source.directUrlSet.forEach(value => target.directUrlSet.add(value))
        source.sandboxPathSet.forEach(value => target.sandboxPathSet.add(value))
        source.nameSet.forEach(value => target.nameSet.add(value))
        source.mimeTypeSet.forEach(value => target.mimeTypeSet.add(value))
        source.expectedSizeSet.forEach(value => target.expectedSizeSet.add(value))
        if (!target.inlineDataUrl) target.inlineDataUrl = source.inlineDataUrl
        source.references.forEach((reference) => {
            const refKey = `${reference.jsonPath}\n${reference.rawValue}\n${reference.kind}`
            if (!target.referenceSet.has(refKey)) {
                target.referenceSet.add(refKey)
                target.references.push(reference)
            }
        })
        for (const alias of source.aliasSet) {
            aliasToKey.set(alias, target.key)
            aliasToKey.set(`file:${alias}`, target.key)
        }
        assets.delete(source.key)
    }

    const add = (
        identifier: string,
        rawValue: string,
        path: string,
        context: MessageContext,
        hints: Hints,
        forcedKind?: AssetKind,
    ): MutableAsset => {
        const normalized = identifier.replace(/^(?:sediment|file-service):\/\//i, '')
            .replace(/^file:\/\/my_files\//i, '')
        const fileIdMatch = normalized.match(new RegExp(FILE_ID_RE.source, 'i'))
        const libraryMatch = normalized.match(new RegExp(LIBRARY_ID_RE.source, 'i'))
        const fileId = fileIdMatch?.[0] ?? libraryMatch?.[0] ?? null
        const key = fileId ? `file:${fileId}` : identifier
        const asset = getAsset(key, fileId)
        if (fileId) {
            aliasToKey.set(fileId, asset.key)
            aliasToKey.set(`file:${fileId}`, asset.key)
            asset.aliasSet.add(fileId)
        }
        if (hints.name) asset.nameSet.add(basename(hints.name))
        if (hints.mimeType) asset.mimeTypeSet.add(hints.mimeType)
        if (hints.expectedSize != null) asset.expectedSizeSet.add(hints.expectedSize)

        const reference: AssetReference = {
            nodeId: context.nodeId,
            messageId: context.messageId,
            messageRole: context.role,
            jsonPath: path,
            kind: forcedKind ?? classify(path, context),
            rawValue: rawValue.slice(0, 1000),
        }
        const refKey = `${reference.jsonPath}\n${reference.rawValue}\n${reference.kind}`
        if (!asset.referenceSet.has(refKey)) {
            asset.referenceSet.add(refKey)
            asset.references.push(reference)
        }
        return asset
    }

    const registerAttachmentAliases = (
        attachment: Record<string, unknown>,
        path: string,
        context: MessageContext,
        hints: Hints,
    ) => {
        const ids = [attachment.id, attachment.file_id, attachment.file_uuid, attachment.library_file_id]
            .filter((value): value is string => typeof value === 'string' && value.length > 0)
        const primary = ids.find(value => FILE_ID_RE.test(value)) ?? ids[0]
        FILE_ID_RE.lastIndex = 0
        if (!primary) return
        const asset = add(primary, primary, path, context, hints)
        for (const id of ids) {
            const existingKey = aliasToKey.get(id) ?? aliasToKey.get(`file:${id}`)
            const existing = existingKey ? assets.get(existingKey) : assets.get(`file:${id}`)
            if (existing && existing !== asset) mergeAsset(asset, existing)
            asset.aliasSet.add(id)
            aliasToKey.set(id, asset.key)
            aliasToKey.set(`file:${id}`, asset.key)
        }
    }

    const scanString = (value: string, path: string, context: MessageContext, hints: Hints) => {
        const matches = new Set<string>()
        for (const regex of [POINTER_RE, MY_FILES_RE, FILE_ID_RE, LIBRARY_ID_RE]) {
            regex.lastIndex = 0
            for (const match of value.matchAll(regex)) matches.add(match[0])
        }
        for (const match of matches) add(match, value, path, context, hints)

        SANDBOX_RE.lastIndex = 0
        for (const match of value.matchAll(SANDBOX_RE)) {
            const sandboxPath = match[0]
            // Interpreter files are scoped to the message that created them.
            // The same /mnt/data filename can occur in several branches, so the
            // message ID must be part of the key as well as the download URL.
            const asset = add(
                `sandbox:${context.messageId}:${sandboxPath}`,
                value,
                path,
                context,
                { ...hints, name: basename(sandboxPath) },
                'sandbox-file',
            )
            asset.sandboxPathSet.add(sandboxPath)
            if (conversationId && context.messageId) {
                const params = new URLSearchParams({
                    message_id: context.messageId,
                    sandbox_path: sandboxPath.replace(/^sandbox:/i, ''),
                })
                asset.directUrlSet.add(
                    `/backend-api/conversation/${encodeURIComponent(conversationId)}/interpreter/download?${params}`,
                )
            }
        }

        DATA_IMAGE_RE.lastIndex = 0
        for (const match of value.matchAll(DATA_IMAGE_RE)) {
            const dataUrl = match[0].replace(/\s/g, '')
            const asset = add(`inline:${hashText(dataUrl)}`, dataUrl, path, context, hints, 'inline-image')
            asset.inlineDataUrl = dataUrl
        }

        FIRST_PARTY_URL_RE.lastIndex = 0
        for (const match of value.matchAll(FIRST_PARTY_URL_RE)) {
            const url = match[0]
            if (!isFirstPartyFileUrl(url)) continue
            const id = url.match(new RegExp(FILE_ID_RE.source, 'i'))?.[0]
            const asset = add(id ?? `url:${hashText(url)}`, url, path, context, hints)
            asset.directUrlSet.add(url)
        }
    }

    const walk = (value: unknown, path: string, context: MessageContext, inheritedHints: Hints) => {
        if (typeof value === 'string') {
            scanString(value, path, context, inheritedHints)
            return
        }
        if (Array.isArray(value)) {
            value.forEach((item, index) => walk(item, `${path}[${index}]`, context, inheritedHints))
            return
        }
        if (!value || typeof value !== 'object') return

        const record = value as Record<string, unknown>
        const hints = hintsFromObject(record, inheritedHints)
        if (path.endsWith('.metadata.attachments') || path.includes('.metadata.attachments[')) {
            registerAttachmentAliases(record, path, context, hints)
        }
        for (const [key, child] of Object.entries(record)) {
            walk(child, `${path}.${key}`, context, hints)
        }
    }

    for (const [nodeId, node] of Object.entries(conversation.mapping ?? {})) {
        const message = node.message
        if (!message) continue
        const context: MessageContext = {
            nodeId,
            messageId: message.id ?? nodeId,
            role: message.author?.role ?? '',
            generatedMessage: generatedMessage(message),
        }
        walk(message, `$.mapping.${nodeId}.message`, context, {})
    }

    // A sandbox link normally points at a file that also appears as a named
    // attachment. Merge it only when the basename identifies exactly one file.
    const named = new Map<string, MutableAsset[]>()
    for (const asset of assets.values()) {
        if (!asset.fileId) continue
        for (const name of asset.nameSet) {
            const key = name.toLowerCase()
            const list = named.get(key) ?? []
            list.push(asset)
            named.set(key, list)
        }
    }
    for (const [key, sandboxAsset] of [...assets.entries()]) {
        if (!key.startsWith('sandbox:')) continue
        const name = [...sandboxAsset.nameSet][0]?.toLowerCase()
        const candidates = name ? named.get(name) : undefined
        if (candidates?.length !== 1) continue
        const target = candidates[0]
        sandboxAsset.references.forEach((reference) => {
            const refKey = `${reference.jsonPath}\n${reference.rawValue}\n${reference.kind}`
            if (!target.referenceSet.has(refKey)) {
                target.referenceSet.add(refKey)
                target.references.push(reference)
            }
        })
        sandboxAsset.directUrlSet.forEach(url => target.directUrlSet.add(url))
        sandboxAsset.sandboxPathSet.forEach(path => target.sandboxPathSet.add(path))
        assets.delete(key)
    }

    return [...assets.values()].map((asset) => ({
        key: asset.key,
        fileId: asset.fileId,
        aliases: [...asset.aliasSet],
        directUrls: [...asset.directUrlSet],
        inlineDataUrl: asset.inlineDataUrl,
        sandboxPaths: [...asset.sandboxPathSet],
        names: [...asset.nameSet],
        mimeTypes: [...asset.mimeTypeSet],
        expectedSizes: [...asset.expectedSizeSet],
        references: asset.references,
    }))
}

export function discoverProjectAssets(project: ProjectRecord): DiscoveredAsset[] {
    return discoverAssets({
        id: `project:${project.id}`,
        title: project.name,
        mapping: {
            project: {
                id: 'project',
                children: [],
                message: {
                    id: `project:${project.id}`,
                    author: { role: 'system', name: 'project' },
                    content: {
                        content_type: 'project_context',
                        raw: project.raw,
                    },
                    metadata: {},
                },
            },
        },
    })
}
