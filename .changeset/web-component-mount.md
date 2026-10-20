---
'@kanbun-skam/skam-web-component': minor
'@kanbun-skam/skam-xml-parser': minor
---

Render `<skam-renderer>` through the html-renderer's `mount()`, fix `class-prefix`, and support Trusted Types from parsing to rendering.

- `skam-web-component`: `<skam-renderer>` now calibrates the grid baseline right after rendering and again after `document.fonts.ready`, like `mount()`. Fonts loaded by `auto-font` are now taken into account.
- `skam-web-component`: with a `class-prefix` other than `skam`, the CSS variables are now `--{class-prefix}-*`, as the README described. Before, the rendered CSS used `--skam-*` while the element set `--{class-prefix}-*`, so baseline calibration, variable overrides on the host and `auto-font` had no effect with a custom prefix. Without `class-prefix`, the output is unchanged.
- `skam-web-component`: new `trustedTypesPolicy` property (experimental) for pages that require Trusted Types. The element passes it to both `parse` and `mount`, so `createHTML` receives the SKAM-ML source and then the rendered HTML. Return the XML unchanged; do not pass an HTML sanitizer as is. If `createHTML` throws, the element reports a non-recoverable `skam-error` with that error's message.
- `skam-web-component`: the element no longer renders while it is disconnected. Content set before the element is attached is rendered once it is connected, and `skam-render` fires then.
- `skam-web-component`: the shadow root keeps exactly one `<style data-skam-css>` for the rendered CSS, replaced on every render.
- `skam-xml-parser`: new `trustedTypesPolicy` parse option (experimental). The browser build passes `createHTML(xml)` to `DOMParser.parseFromString`, which Trusted Types otherwise blocks. It is called once, after the input-limit checks, and its errors propagate unchanged. Limits and positions are computed on the original string, so the policy must return the XML unchanged. The Node build ignores the option.
