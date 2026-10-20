---
'@kanbun-skam/skam': minor
'@kanbun-skam/skam-html-renderer': patch
---

Look up the marks of each token from an index built once per render.

- `@kanbun-skam/skam/rendering` exports `createMarkLookup(marks, tokenGroups)` and the types `MarkLookup` and `TokenMarks`. Pass `groupTokensByBlock(blocks, tokens).map((g) => g.tokens)` as `tokenGroups`. The returned function gives the marks of a token by type in O(1).
- `getMarksForToken(tokenId, marks, allTokens)` keeps its signature and results. It builds the index on every call, so use `createMarkLookup` to look up many tokens.
- The HTML renderer, the canvas renderer and `buildAnnotationIR` build the index once per render. On a 2000-character document with highlights on 1 in 10 characters, the HTML `render()` took 2239 ms before and 12 ms after.
- HTML renderer fix: the middle tokens of a range mark (emphasis, highlight, okimoji and others) were chosen by the order of `tokens[]`. They now follow the source order (`blocks[].tokenIds`), as the canvas renderer and `buildAnnotationIR` already did. Output changes only for documents whose `tokens[]` is not in source order.
