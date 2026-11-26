---
'@kanbun-skam/skam-web-component': patch
---

`<skam-renderer>` now uses `xmlContent`, `accessibleLabels` and `trustedTypesPolicy` values that were assigned to the element before `customElements.define` ran. Before, such a value stayed on the instance and hid the class accessor after the upgrade, so the element rendered nothing and reported no error (for example when the defining script loads late). The element now moves these values through its accessors when it is upgraded. Assigning after `define` works as before.
