# Canvas interface references

2026-10-22. The application uses vanilla JavaScript. These React libraries inform the component structure and interaction design; their React components are not installed or represented as installed. Motion 12.43.0 is bundled locally and actually drives menu/dialog entrances.

- Beautiful UI — https://www.beautifului.dev/ : public catalog's Task Rows, Context Cards and Selection Actions informed task details and bulk selection. Live preview access was denied by the browser's saved origin policy, including an existing Chrome tab; no interactive inspection is claimed.
- beUI — https://beui.dev/ : restrained press feedback, modal transitions and segmented state changes. Public documentation reviewed.
- Generative Loaders — https://generativeloaders.com/docs : reserved image frame with a non-determinate scan, compact state indicators and reduced-motion support. No fabricated progress percentage.
- AI Elements — https://elements.ai-sdk.dev/components/prompt-input and https://elements.ai-sdk.dev/components/queue : contextual input attachments, grouped controls, collapsible task details and input thumbnails.
- shadcn/ui — https://ui.shadcn.com/docs/components/base/dropdown-menu : consistent row padding, alignment, selection states, separators, destructive actions and keyboard navigation.

Implementation: shared controls in canvas-ui.js/css; empty image upload lives inside its reserved image frame; project management uses explicit actions; asset selection persists outside virtualized card DOM; task details preserve input snapshots and do not remount on unchanged polling. Bulk asset creation checkpoints and renders once. Asset deletion uses the existing recoverable trash API.
