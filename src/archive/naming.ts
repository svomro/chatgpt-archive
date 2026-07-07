import sanitize from 'sanitize-filename'
import type { ProjectRecord, RawConversation } from '../chatgpt/types'
import type { DiscoveredAsset } from './types'

const MIME_EXTENSIONS: Record<string, string> = {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/gif': '.gif',
    'image/webp': '.webp',
    'image/svg+xml': '.svg',
    'image/avif': '.avif',
    'image/heic': '.heic',
    'image/heif': '.heif',
    'audio/mpeg': '.mp3',
    'audio/mp4': '.m4a',
    'audio/wav': '.wav',
    'video/mp4': '.mp4',
    'application/pdf': '.pdf',
    'application/json': '.json',
    'text/plain': '.txt',
    'text/csv': '.csv',
}

export function safeName(value: string, fallback: string, maxLength = 160): string {
    const cleaned = sanitize(value, { replacement: '_' })
        .replace(/[. ]+$/g, '')
        .trim()
    return (cleaned || fallback).slice(0, maxLength)
}

function basename(value: string): string {
    const clean = value.split(/[?#]/, 1)[0]
    return clean.slice(clean.lastIndexOf('/') + 1)
}

function splitExtension(value: string): { base: string; extension: string } {
    const dot = value.lastIndexOf('.')
    if (dot <= 0 || dot === value.length - 1) return { base: value, extension: '' }
    return { base: value.slice(0, dot), extension: value.slice(dot) }
}

function fallbackLabel(asset: DiscoveredAsset): string {
    const kind = asset.references[0]?.kind ?? 'attachment'
    const messageId = asset.references[0]?.messageId
    return messageId ? `${kind}_${messageId}` : kind
}

export function assetFileName(
    asset: DiscoveredAsset,
    resolvedName?: string | null,
    resolvedMime?: string | null,
): string {
    const candidate = resolvedName
        ?? asset.names.find(Boolean)
        ?? fallbackLabel(asset)
    const safeCandidate = safeName(basename(candidate), fallbackLabel(asset), 180)
    const { base, extension: originalExtension } = splitExtension(safeCandidate)
    const mime = resolvedMime ?? asset.mimeTypes[0] ?? ''
    const extension = originalExtension || MIME_EXTENSIONS[mime.toLowerCase()] || ''
    const id = safeName(asset.fileId ?? asset.key.replace(/^[^:]+:/, ''), 'no-id', 96)
    return `${safeName(base, fallbackLabel(asset), 140)}_[${id}]${extension}`
}

export function timestampLabel(value: number | string | undefined): string {
    let date: Date
    if (typeof value === 'number') date = new Date(value * 1000)
    else if (typeof value === 'string') date = new Date(value)
    else date = new Date()
    if (Number.isNaN(date.getTime())) date = new Date()
    const pad = (input: number): string => String(input).padStart(2, '0')
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
        + `T${pad(date.getHours())}-${pad(date.getMinutes())}-${pad(date.getSeconds())}`
}

export function conversationId(conversation: RawConversation): string {
    return String(conversation.id ?? conversation.conversation_id ?? 'unknown-conversation')
}

export function conversationFolderName(conversation: RawConversation): string {
    const id = conversationId(conversation)
    return `[Original]_[${safeName(String(conversation.title ?? 'Untitled'), 'Untitled')}]_[${safeName(id, 'unknown-id', 80)}]`
}

export function projectFolderName(project: ProjectRecord): string {
    const prefix = project.id.startsWith('g-p-') ? 'Project' : 'GPT'
    return `[${prefix}]_[${safeName(project.name, project.id)}]_[${safeName(project.id, 'unknown-project', 96)}]`
}
