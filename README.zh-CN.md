<p align="center">
  <img src="assets/logo.png" alt="Peer — a pear between two outstretched hands" width="620" />
</p>

<h1 align="center">Peer</h1>

<p align="center">让追踪研究进展变得从容。</p>

<p align="center">
  <a href="https://peer.homes">打开 Peer</a> ·
  <a href="README.md">English</a> ·
  <a href="CONTRIBUTOR_GUIDE.md">开发者指南</a>
</p>

Peer 把与你相关的论文整理成每日简报，也提供阅读和记录的空间。告诉 Peer 你正在研究什么，随着研究推进随时调整兴趣。

## 从发现到理解

- **关注自己的研究领域。** 根据主题与研究兴趣，从 OpenAlex、arXiv、PubMed、Semantic Scholar、DBLP 等来源发现论文。
- **专注阅读。** 在可获得可读全文时，浏览论文的章节、图片、表格和公式；无法获取时，可以访问原始来源。
- **留下自己的笔记。** 标记段落，在独立的笔记空间整理想法。
- **搜索更多论文。** 按主题、标题、作者或期刊查找简报之外的研究。

核心简报无需 AI 密钥即可使用。可选的模型功能使用你自己的密钥；功能可用性和结果取决于来源与服务商。

## 本地运行

主要应用位于 [`web/`](web/)，使用 Node.js 22 和 npm：

```bash
git clone https://github.com/peer-research-project/peer.git
cd peer/web
npm ci
npm run dev -- -p 3001
```

打开 [localhost:3001](http://localhost:3001)。基础功能可以不配置环境变量运行；登录、数据持久化和其他集成的配置参见 [`web/.env.example`](web/.env.example)。不要将密钥提交到仓库。

```bash
npm test
npm run lint
npm run build
```

[`python/`](python/) 中还有最初的本地优先命令行工具，与 Web 应用是独立实现。

## 项目资料

- [产品方向](docs/PRODUCT_DIRECTION.md)与[产品愿景](VISION.md)
- [开发者指南](CONTRIBUTOR_GUIDE.md)与[项目规则](AGENTS.md)
- [贡献者许可协议](docs/CLA.md)与[第三方组件声明](docs/THIRD_PARTY_NOTICES.md)

## 许可

版权所有 © 2026 Baichuan Wang 和 Xiaoyang Wang。Peer 使用 [AGPL-3.0-only](LICENSE) 许可。此前以 MIT 许可发布的版本仍适用其原许可；第三方组件各自保留其许可。
