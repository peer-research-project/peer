<p align="center">
  <img src="assets/logo.png" alt="Peer — a pear between two outstretched hands" width="620" />
</p>

<h1 align="center">Peer</h1>

<p align="center">A quieter way to keep up with research.</p>

<p align="center">
  <a href="https://peer.homes">Open Peer</a> ·
  <a href="README.zh-CN.md">简体中文</a> ·
  <a href="CONTRIBUTOR_GUIDE.md">Contributor guide</a>
</p>

Peer brings relevant papers together in a focused daily briefing, then gives you a place to read and keep notes. Tell it what you work on, and refine your interests as your research changes.

## From discovery to understanding

- **A briefing for your field.** Follow topics and research interests to find papers across sources including OpenAlex, arXiv, PubMed, Semantic Scholar, and DBLP.
- **A place to read.** Explore a paper’s sections, figures, tables, and equations when readable full text is available. When it isn't, Peer links back to the source.
- **Notes that stay yours.** Highlight passages and collect your thoughts in a dedicated notes workspace.
- **Search beyond the briefing.** Look up papers by topic, title, author, or venue.

The core briefing works without an AI key. Optional model features use your own key; availability and results depend on the source and provider.

## Run locally

The main application is in [`web/`](web/). Use Node.js 22 and npm:

```bash
git clone https://github.com/peer-research-project/peer.git
cd peer/web
npm ci
npm run dev -- -p 3001
```

Open [localhost:3001](http://localhost:3001). The basic experience can run without environment variables. For sign-in, persistence, and other integrations, see [`web/.env.example`](web/.env.example). Keep credentials out of the repository.

```bash
npm test
npm run lint
npm run build
```

The separate [`python/`](python/) directory contains the original local-first CLI. Its implementation is independent of the web app.

## Project resources

- [Product direction](docs/PRODUCT_DIRECTION.md) and [vision](VISION.md)
- [Contributor guide](CONTRIBUTOR_GUIDE.md) and [project rules](AGENTS.md)
- [Contributor license agreement](docs/CLA.md) and [third-party notices](docs/THIRD_PARTY_NOTICES.md)

## License

Copyright © 2026 Baichuan Wang and Xiaoyang Wang. Peer is licensed under [AGPL-3.0-only](LICENSE). Earlier versions released under MIT remain under their original license; third-party components retain their own licenses.
