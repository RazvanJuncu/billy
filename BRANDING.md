# Billy — Brand and Interface Principles

## Brand promise
**Billy. Paper, decoded.**

Billy turns uneven, imperfect paper into clean, reviewable documents. The name is playful; the interface is purposeful.

## Borrowed philosophy (Glide)

The UI should act as guidance, not a dashboard. One unmistakable next action, progressive disclosure, and quiet supporting information. Maintain a flat minimalist finish with carefully restrained borders and shadow; no gradients, glass, glow, or ornamental badges.

## Core values

1. **Clarity:** Capture → Straighten → Extract → Review, with an explicit active stage.
2. **Control:** The camera and perspective correction run on-device. Users can adjust corners and inspect originals.
3. **Precision:** Never imply successful OCR when the PaddleOCR backend is disconnected; require review of money values.
4. **Calm:** Errors are informative and recoverable, not alarming. No red warning for an optional offline OCR engine.
5. **Efficiency:** On iPhone, the camera is the obvious first action, visible without scrolling through a dashboard hero.

## Design tokens

| Role | Token | Hex |
|---|---|---|
| Primary text | Midnight ink | `#172B49` |
| Primary interaction | Billy blue | `#326DCC` |
| Subtle interactive fill | Soft blue | `#EAF1FD` |
| App background | Paper mist | `#F6F8FB` |
| Border | Cool gray | `#E3E9F1` |
| Secondary text | Muted slate | `#6A7B91` |

System UI font stack (Inter when installed). No external font download is required. 9–14px card radii, 1px borders, short low-contrast shadows, generous desktop space but compact mobile actions.

## Mobile-first rules

- 1st screen: product name, short promise, four-stage progress line and camera/import actions.
- Start action: **Capture document**. Second action: **Choose photo**. File-picker fallback remains inside the source area.
- Camera flow: capture, adjust four corners, perspective flatten, save/use scan. OCR remains an optional next step.
- Once a document is chosen, step **Extract** becomes current; on valid OCR output, **Review** becomes current.
- The empty review panel is hidden on narrow screens until results exist. On desktop it can explain the forthcoming output.
- Keep status in a subtle informational strip within the capture card; expanded OCR settings must never overlay the document.

## Copy guidelines

Prefer: “Capture a document”, “Adjust corners”, “Use this scan”, “Review document”. Reserve words like “endpoint”, “pipeline” or “inference” for diagnostic or setup sections.

## Technical boundaries

This design pass does **not** add a hosted OCR service. GitHub Pages is static. The iPhone cannot reach a PC over `127.0.0.1`; actual text extraction still requires a properly secured, reachable HTTPS PaddleOCR backend. Browser-based perspective correction is supported separately.

## Future

Document intelligence cards, confidence badges only for meaningful uncertainty, field-to-source highlighting, multi-page scans, and AI financial interpretation. Do not build these as decoration before they function.
