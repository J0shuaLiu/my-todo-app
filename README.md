# Todo

Single-file todo app with an AI "summarize my day" button (Claude API).

```sh
cp .env.example .env   # add your Anthropic API key
node server.js         # then open http://localhost:3000
```

No dependencies, no build step. `server.js` serves `index.html` and proxies the
summary request so the API key never leaves the server. `.env` is gitignored —
never commit it.
