# Peer web app

The web app is Peer's main interface for discovering, reading, and keeping notes on research. For an overview, see the [project README](../README.md) or [中文版](../README.zh-CN.md).

## Local development

Use Node.js 22 and npm:

```bash
npm ci
npm run dev -- -p 3001
```

Open [localhost:3001](http://localhost:3001). The core briefing works without a model key. For optional sign-in, data persistence, and other integrations, see [`.env.example`](.env.example); keep credentials in a local environment file and out of version control.

## Checks

```bash
npm test
npm run lint
npm run build
```

The app uses Next.js 16, React 19, and TypeScript. Before changing framework code, follow the guidance in [AGENTS.md](AGENTS.md). See the [contributor guide](../CONTRIBUTOR_GUIDE.md) for architecture and development notes.
