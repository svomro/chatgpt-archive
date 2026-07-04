import type {
    ConversationListItem,
    ConversationRecord,
    ProjectRecord,
} from '../chatgpt/types'

export type ConversationSortField = 'title' | 'create_time' | 'update_time'
export type ConversationSortDirection = 'asc' | 'desc'

function timeValue(value: number | string | undefined): number {
    if (typeof value === 'number') return value * 1000
    if (typeof value === 'string') return Date.parse(value) || 0
    return 0
}

export function excludeProjectConversations(
    items: ConversationListItem[],
    projects: ProjectRecord[],
): ConversationListItem[] {
    const projectIds = new Set(projects.map(project => project.id))
    return items.filter(item => !item.gizmo_id || !projectIds.has(item.gizmo_id))
}

export function sortConversationRecords(
    records: ConversationRecord[],
    field: ConversationSortField,
    direction: ConversationSortDirection,
): ConversationRecord[] {
    const multiplier = direction === 'asc' ? 1 : -1
    return [...records].sort((left, right) => {
        if (field === 'title') {
            return multiplier * left.item.title.localeCompare(right.item.title)
        }
        return multiplier * (
            timeValue(field === 'update_time' ? left.item.update_time : left.item.create_time)
            - timeValue(field === 'update_time' ? right.item.update_time : right.item.create_time)
        )
    })
}

export function selectConversationRecords(
    records: ConversationRecord[],
    selectedIds: Iterable<string>,
): ConversationRecord[] {
    const selected = new Set(selectedIds)
    return records.filter(record => selected.has(record.item.id))
}
