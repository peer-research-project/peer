// Public source metadata only. Never calls a model or prints fetched abstracts.
const base = process.env.PEER_VERIFY_ORIGIN || 'http://127.0.0.1:4314';
for (const id of ['openalex:W7222962933','arxiv:1706.03762','openalex:W7204479535']) {
  const start = Date.now();
  const metadataResponse = await fetch(`${base}/api/papers/${encodeURIComponent(id)}?sourceVersion=2`,{signal:AbortSignal.timeout(35000)});
  const metadata = await metadataResponse.json();
  const readingResponse = await fetch(`${base}/api/papers/${encodeURIComponent(id)}/reading?v=19`,{signal:AbortSignal.timeout(35000)});
  const reading = await readingResponse.json();
  console.log(JSON.stringify({
    id,metadataHttp:metadataResponse.status,readingHttp:readingResponse.status,
    metadataAbstractChars:(metadata.summaryIntro||'').length+(metadata.summaryResultDiscussion||'').length,
    abstractRetrieval:metadata.abstractRetrieval||null,
    readingAbstract:reading.provenance?.abstract,
    readingAbstractSentences:reading.provenance?.abstractSentences,
    fullText:reading.provenance?.fullText,
    paywallHost:reading.provenance?.paywallHost||null,
    blockedHost:reading.provenance?.blockedHost||null,
    sourceFingerprint:reading.sourceFingerprint||null,
    metadataCache:metadataResponse.headers.get('cache-control'),
    readingCache:readingResponse.headers.get('cache-control'),
    elapsedMs:Date.now()-start,
  }));
}
