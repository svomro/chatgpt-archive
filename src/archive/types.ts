import type { ProjectRecord, RawConversation } from '../chatgpt/types'

export type AssetKind =
    | 'user-upload'
    | 'generated-image'
    | 'image-input'
    | 'cot-output'
    | 'audio'
    | 'video'
    | 'library-file'
    | 'attachment'
    | 'sandbox-file'
    | 'inline-image'

export interface AssetReference {
    nodeId: string
    messageId: string
    messageRole: string
    jsonPath: string
    kind: AssetKind
    rawValue: string
}

export interface DiscoveredAsset {
    key: string
    fileId: string | null
    aliases: string[]
    directUrls: string[]
    inlineDataUrl: string | null
    sandboxPaths: string[]
    names: string[]
    mimeTypes: string[]
    expectedSizes: number[]
    references: AssetReference[]
    referenceOnly: boolean
    referenceOnlyReason: string | null
}

export type AssetStatus = 'downloaded' | 'existing' | 'failed' | 'unresolved' | 'reference-only'

export interface AssetManifestEntry {
    key: string
    fileId: string | null
    aliases: string[]
    localFile: string | null
    status: AssetStatus
    mimeType: string | null
    expectedSize: number | null
    actualSize: number | null
    sha256: string | null
    attempts: number
    error: string | null
    reason: string | null
    references: AssetReference[]
}

export interface AttachmentManifest {
    version: number
    generatedAt: string
    conversationId: string
    expected: number
    downloaded: number
    existing: number
    failed: number
    unresolved: number
    referenceOnly: number
    complete: boolean
    coverageWarnings: string[]
    assets: AssetManifestEntry[]
}

export interface ArchiveProgress {
    phase: 'listing' | 'conversation' | 'attachments' | 'done'
    current: number
    total: number
    title: string
    detail: string
}

export interface ArchiveConversationInput {
    conversation: RawConversation
    project: ProjectRecord | null
}

export interface ArchiveSummary {
    projects: number
    failedProjects: number
    incompleteProjects: number
    conversations: number
    completeConversations: number
    failedConversations: number
    downloaded: number
    existing: number
    failedAssets: number
    unresolvedAssets: number
    referenceOnlyAssets: number
    errors: Array<{ conversationId: string; title: string; error: string }>
}
