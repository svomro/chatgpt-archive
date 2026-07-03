export interface AccountProfile {
    id: string
    email: string
    name: string
    accountId: string | null
}

export interface ConversationListItem {
    id: string
    title: string
    create_time: number | string
    update_time?: number | string
    gizmo_id?: string | null
    [key: string]: unknown
}

export interface RawConversation {
    id?: string
    conversation_id?: string
    title?: string
    create_time?: number | string
    update_time?: number | string
    current_node?: string
    gizmo_id?: string | null
    conversation_template_id?: string | null
    memory_scope?: string | null
    mapping?: Record<string, RawConversationNode>
    [key: string]: unknown
}

export interface RawConversationNode {
    id?: string
    parent?: string
    children?: string[]
    message?: RawMessage | null
    [key: string]: unknown
}

export interface RawMessage {
    id?: string
    author?: {
        role?: string
        name?: string | null
        [key: string]: unknown
    }
    content?: Record<string, unknown>
    metadata?: Record<string, unknown>
    create_time?: number
    [key: string]: unknown
}

export interface ProjectRecord {
    id: string
    name: string
    description: string
    raw: unknown
}

export interface ConversationRecord {
    item: ConversationListItem
    project: ProjectRecord | null
}

export type FileDownloadResponse = {
    status: 'success'
    download_url: string
    file_name: string | null
    file_size_bytes: number | null
    mime_type: string | null
    creation_time?: string | null
    metadata?: unknown
} | {
    status: 'error'
    error_code: string
    error_message: string | null
}
