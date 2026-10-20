---
'@kanbun-skam/skam-html-renderer': minor
'@kanbun-skam/skam-web-component': minor
---

Render without inline `style` attributes for pages whose CSP uses a nonce-only `style-src`, and pass the nonce through the Web Component.

- `skam-html-renderer`: new `inlineStyles` render option (experimental, default `true`). With `false`, okototen positions and emphasis shapes are emitted as `data-okototen-*` and `data-emphasis-style` attributes instead of `style` attributes. The default output is unchanged.
- `skam-html-renderer`: new `applyRenderedStyles(root)` (experimental) sets those values through the CSSOM, which CSP does not block. It accepts only safe non-negative integers for positions and emphasis keywords or one character for shapes; other attribute values are ignored.
- `skam-html-renderer`: `mount()` now always renders with `inlineStyles: false` and calls `applyRenderedStyles`, so it no longer needs `style-src-attr` on nonce-only CSP pages. `MountResult.html` (and the string given to a Trusted Types `createHTML`) is the data-attribute version; call `applyRenderedStyles` if you insert it elsewhere. `MountOptions` no longer accepts `inlineStyles`.
- `skam-web-component`: `<skam-renderer nonce="…">` puts the nonce on its shadow-root `<style>` elements, passes it to `mount`, and adds it to the Google Fonts `<link>` that `auto-font` inserts. Set the nonce before the element is connected; changing it later does not re-render by itself.
