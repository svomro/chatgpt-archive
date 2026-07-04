import { describe, expect, it } from 'vitest'
import type { ConversationRecord, ProjectRecord } from '../chatgpt/types'
import {
    excludeProjectConversations,
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

    it('removes known Project conversations from the personal list', () => {
        const project: ProjectRecord = { id: 'g-p-work', name: 'Work', description: '', raw: {} }
        const items = [
            { id: 'personal', title: 'Personal', create_time: 1, gizmo_id: null },
            { id: 'project', title: 'Project', create_time: 2, gizmo_id: project.id },
            { id: 'custom-gpt', title: 'Custom GPT', create_time: 3, gizmo_id: 'g-custom' },
        ]

        expect(excludeProjectConversations(items, [project]).map(item => item.id))
            .toEqual(['personal', 'custom-gpt'])
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
})
