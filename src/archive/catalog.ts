import type {
    ConversationListItem,
    ConversationRecord,
} from '../chatgpt/types'

export type ConversationSortField = 'title' | 'create_time' | 'update_time'
export type ConversationSortDirection = 'asc' | 'desc'
export const SEARCH_SEPARATOR = ''

function timeValue(value: number | string | undefined): number {
    if (typeof value === 'number') return value * 1000
    if (typeof value === 'string') return Date.parse(value) || 0
    return 0
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

export function matchesConversationSearch(
    item: ConversationListItem,
    query: string,
): boolean {
    const terms = query
        .split(SEARCH_SEPARATOR)
        .map(term => term.trim().toLocaleLowerCase())
        .filter(Boolean)
    if (!terms.length) return true
    const title = item.title.toLocaleLowerCase()
    const id = item.id.toLocaleLowerCase()
    return terms.some(term => title.includes(term) || id.includes(term))
}

export function selectConversationRecords(
    records: ConversationRecord[],
    selectedIds: Iterable<string>,
): ConversationRecord[] {
    const selected = new Set(selectedIds)
    return records.filter(record => selected.has(record.item.id))
}
