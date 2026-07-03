import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import type { RawConversation } from '../chatgpt/types'
import { discoverAssets } from './discover'

const fixtureDirectory = process.env.CHATGPT_ARCHIVE_FIXTURES

describe.skipIf(!fixtureDirectory)('private ChatGPT JSON audit', () => {
    it('scans every supplied conversation without duplicate asset keys', () => {
        const files = fs.readdirSync(fixtureDirectory!)
            .filter(file => file.endsWith('.json'))
        let conversations = 0
        let assets = 0
        let references = 0

        for (const file of files) {
            const parsed = JSON.parse(fs.readFileSync(path.join(fixtureDirectory!, file), 'utf8'))
            const conversation = (Array.isArray(parsed) ? parsed[0] : parsed) as RawConversation
            if (!conversation || typeof conversation !== 'object') continue
            const discovered = discoverAssets(conversation)
            const keys = discovered.map(asset => asset.key)
            expect(new Set(keys).size, file).toBe(keys.length)
            conversations += 1
            assets += discovered.length
            references += discovered.reduce((sum, asset) => sum + asset.references.length, 0)
        }

        console.info({ conversations, assets, references })
        expect(conversations).toBeGreaterThan(0)
        expect(assets).toBeGreaterThan(0)
    })
})
