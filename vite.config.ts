import { defineConfig } from 'vite'
import monkey from 'vite-plugin-monkey'

export default defineConfig({
    esbuild: { charset: 'utf8' },
    plugins: [
        monkey({
            entry: 'src/main.ts',
            userscript: {
                name: 'ChatGPT Archive',
                namespace: 'svomro',
                description: 'Archive raw ChatGPT JSON and all first-party attachments.',
                author: 'svomro',
                license: 'MIT',
                match: ['https://chatgpt.com/*', 'https://chat.openai.com/*'],
                icon: 'https://chatgpt.com/favicon.ico',
                updateURL: 'https://raw.githubusercontent.com/svomro/chatgpt-archive/main/dist/chatgpt-archive.user.js',
                downloadURL: 'https://raw.githubusercontent.com/svomro/chatgpt-archive/main/dist/chatgpt-archive.user.js',
                'run-at': 'document-end',
            },
            build: { fileName: 'chatgpt-archive.user.js' },
        }),
    ],
})
