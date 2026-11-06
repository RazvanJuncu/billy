# Billy / Document Studio — interface direction v0.4

Billy uses the **instrument-first philosophy of Glide**, not a marketing website theme.

## Reference: Glide's actual visual language

Glide is built around an uninterrupted work surface (map) with compact, purpose-built floating instruments. Its actual design tokens in \`RazvanJuncu/laneform/src/style.css\` are satin obsidian (#050607), panels (#0D1114), raised surfaces (#171C20), platinum (#E7EAED), silver (#C7CDD2), and steel (#7F8C96). Billy adopts this *environment* for paper/document handling.

## Interface layout

- **Desktop:** 62px navigation rail on the left; document canvas in the center; 310px contextual control center on the right; compact topbar. Full-viewport, no hero and no dead dashboard cards.
- **iPhone:** App-like full-screen work surface, dedicated document viewport and camera/import controls; three functional bottom tabs (Capture, Review, Engine); safe-area-aware layout.
- **Document viewport:** original scan is always a visual artifact, not an upload form. Blank state uses an unobtrusive outline and miniature page; loaded state displays the real image or PDF.
- **Processing inspector:** numbered Capture → Straighten → Extract → Review flow, connection status, OCR action, endpoint settings, integrity notes.
- **Review mode:** source ↔ extracted tabs; blank review explicitly states that OCR is not connected, never inventing a successful result.

## Visual principles

1. Work surface is dominant; settings and controls contextual.
2. Almost monochrome with muted neutral accents, low contrast borders and restrained shadows.
3. Rounded 6–11px instruments; flat, no liquid glass, no kitsch, no glows.
4. One solid platinum CTA at a time; contextual controls only when actionable.
5. Important source-traceability and OCR constraints are explicit.
6. Small technical labels provide structure without ornamental badges.

## Tokens

| Role | Value |
|---|---|
| Obsidian / app | \`#050607\` |
| Panel | \`#0D1114\` |
| Raised control | \`#171C20\` |
| Platinum text / primary action | \`#E7EAED\` |
| Silver | \`#C7CDD2\` |
| Steel | \`#7F8C96\` |
| Divider | \`rgba(199,205,210,.13)\` |

## Real functionality constraints

PaddleOCR remains a separate Python service. GitHub Pages only hosts the PWA shell. On iPhone, its loopback address is not the Windows PC; mobile OCR will require a secured HTTPS API. Scanning, manual crop and perspective correction run on-device, with no invented AI interpretations. The camera and OCR hooks must survive every styling refactor.

## Next pass

Hands-on iPhone screenshots, then calibration of image capture and document detection; finally a properly authenticated OCR service and field-level review.
