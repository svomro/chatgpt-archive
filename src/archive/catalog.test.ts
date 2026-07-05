import { describe, expect, it } from 'vitest'
import type { ConversationRecord, ProjectRecord } from '../chatgpt/types'
import {
    matchesConversationSearch,
    SEARCH_SEPARATOR,
    selectConversationRecords,
    sortConversationRecords,
} from './catalog'

function record(id: string, owner: ProjectRecord | null): ConversationRecord {
    return { item: { id, title: id, create_time: 0 }, project: owner }
}

describe('archive catalog', () => {
    it('keeps only selected conversations in catalog order', () => {
        const records = [record('newest', null), record('older', null), record('oldest', null)]
        expect(selectConversationRecords(records, ['oldest', 'newest']).map(item => item.item.id))
            .toEqual(['newest', 'oldest'])
    })

    it('sorts the loaded records by title, created time, or updated time', () => {
        const records: ConversationRecord[] = [
            { item: { id: 'beta', title: 'Beta', create_time: 10, update_time: 20 }, project: null },
            { item: { id: 'alpha', title: 'Alpha', create_time: 30, update_time: 15 }, project: null },
        ]

        expect(sortConversationRecords(records, 'title', 'asc').map(record => record.item.id))
            .toEqual(['alpha', 'beta'])
        expect(sortConversationRecords(records, 'create_time', 'desc').map(record => record.item.id))
            .toEqual(['alpha', 'beta'])
        expect(sortConversationRecords(records, 'update_time', 'desc').map(record => record.item.id))
            .toEqual(['beta', 'alpha'])
    })

    it('searches loaded conversations by title or conversation ID', () => {
        const item = {
            id: '67F8A9BC-Conversation-ID',
            title: 'Quarterly Archive Review',
            create_time: 0,
        }

        expect(matchesConversationSearch(item, 'archive review')).toBe(true)
        expect(matchesConversationSearch(item, 'f8a9bc-conversation')).toBe(true)
        expect(matchesConversationSearch(item, 'missing')).toBe(false)
        expect(matchesConversationSearch(item, `missing${SEARCH_SEPARATOR}f8a9bc`)).toBe(true)
        expect(matchesConversationSearch(item, `missing${SEARCH_SEPARATOR}unknown`)).toBe(false)
    })
})
