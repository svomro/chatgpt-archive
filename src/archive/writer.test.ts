import { describe, expect, it } from 'vitest'
import { existingFileByMarkers } from './writer'

describe('existingFileByMarkers', () => {
    it('finds a previously saved attachment by its stable file marker', async () => {
        const file = new File(['kept'], 'original_[file-abc1234567890123].txt', { type: 'text/plain' })
        const folder = {
            async *entries() {
                yield [file.name, { kind: 'file', getFile: async () => file }]
            },
        }

        const result = await existingFileByMarkers(
            folder as unknown as FileSystemDirectoryHandle,
            ['file-abc1234567890123'],
        )

        expect(result?.name).toBe(file.name)
    })

    it('fails when several local files match the same marker', async () => {
        const files = [
            new File(['one'], 'one_[file-abc1234567890123].txt'),
            new File(['two'], 'two_[file-abc1234567890123].txt'),
        ]
        const folder = {
            async *entries() {
                for (const file of files) {
                    yield [file.name, { kind: 'file', getFile: async () => file }]
                }
            },
        }

        await expect(existingFileByMarkers(
            folder as unknown as FileSystemDirectoryHandle,
            ['file-abc1234567890123'],
        )).rejects.toThrow('Multiple local files match attachment markers')
    })
})
