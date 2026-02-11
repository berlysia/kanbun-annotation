---
name: update-baseline-overrides
description: Detect and update baseline override fallback descriptions
trigger: /update-baseline-overrides
---

# Update Baseline Overrides

Detect features without override definitions and add/update fallback descriptions in the section-specific override files.

## Workflow

1. **Regenerate report**: Run `pnpm --filter @kanbun/baseline-check report`
2. **Detect unknowns**: Run `node packages/baseline-check/scripts/check-overrides.js`
   - stdout: JSON array of unknown features
   - stderr: human-readable summary
   - If empty array (`[]`): report "All overrides are defined" and stop
3. **Investigate each unknown feature**:
   a. Search for CSS/JS usage in source code:
   - Renderer features: `packages/skam-html-renderer/src/`, `packages/skam-canvas-renderer/src/`
   - Playground features: `packages/playground/src/`
     b. Understand the feature's purpose in context
     c. Check browser support status (MDN, web-platform-tests, caniuse)
     d. Assess impact when feature is unsupported
4. **Propose overrides**: For each feature, determine:
   - `status`: `safe` | `degraded` | `broken`
   - `fallback`: concise description of fallback behavior
5. **Present proposals** to the user for review
6. **Update override files**:
   - `packages/baseline-check/baseline-overrides-renderer.json` for html/canvas features
   - `packages/baseline-check/baseline-overrides-playground.json` for playground features
7. **Regenerate report**: Run `pnpm --filter @kanbun/baseline-check report` to verify

## Status Criteria

- **safe**: Feature has a fallback or its absence causes no visible impact
- **degraded**: Feature absence causes reduced but functional user experience
- **broken**: Feature absence causes critical functionality to break

## Fallback Description Guidelines

- Describe what happens when the browser does NOT support the feature
- Include browser version info for recently-added features (e.g., "Safari 18.2+/Chrome 128+")
- Be section-specific: renderer descriptions focus on rendering impact, playground on UI impact
- Keep descriptions concise but informative (1-2 sentences)
- If a `@supports` guard or vendor prefix is used, mention it

## Override File Format

```json
{
  "feature-name": {
    "status": "safe",
    "fallback": "Concise description of fallback behavior"
  }
}
```
