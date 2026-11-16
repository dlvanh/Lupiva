<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Lupiva — Agent Development Guidelines (`AGENTS.md`)

**Lupiva** is an Intelligent Systemic Lupus Erythematosus (SLE) Clinical Registry & Patient Companion Platform built for the **Vinmec Innovation Challenge 2026**.

## 1. Architecture & Tech Stack
- **Framework**: Next.js 16 (App Router) with React 19 (`src/app/`)
- **Language**: TypeScript 5 (`strict: true`)
- **Styling**: Tailwind CSS v4 (`@import "tailwindcss";` in `src/app/globals.css`)
- **State & Mock Data**:
  - `src/data/mockData.ts`: Typed clinical mock datasets (`DEMO_USERS`, `MOCK_LAB_REPORTS`, `BUTTON_ACTION_MAP`).
  - `src/context/LupivaContext.tsx`: Shared client context for role-based session state, active report selection, saved e-CRF registry entries, toast feedback, and the interactive UI Button Action Guide modal.

## 2. Core Application Routes
1. **Landing Page (`src/app/page.tsx` -> `/`)**:
   - Presents the SLE clinical registry (e-CRF) value proposition, 3-step Physician-in-the-Loop (HITL) OCR workflow, sample SLE lab report cards, and an interactive Button Action Guide.
2. **Authentication Page (`src/app/login/page.tsx` -> `/login`)**:
   - Supports switching between **Vinmec Clinical Specialist** (`Dr. Nguyen Minh`) and **SLE Registry Patient** (`Tran Thi Mai`).
   - Includes one-click demo credential autofill buttons and an informed consent toggle for patient registry contributions.
3. **Document OCR & e-CRF Workspace (`src/app/ocr/page.tsx` -> `/ocr`)**:
   - **Left Pane (Source Document Viewer)**: Renders realistic scanned clinical lab reports (or user-uploaded images) with zoom controls (`75%`–`150%`), a simulated OCR laser scan pass, and interactive color-coded bounding boxes.
   - **Right Pane (Structured e-CRF Extraction Table)**: Displays extracted SLE biomarkers (`ANA`, `Anti-dsDNA`, `Complement C3/C4`, `Urinalysis`, `CBC`), units, reference intervals, clinical abnormality badges, OCR confidence scores, inline value editing, row-level verification, JSON export, and saving to the SLE Registry.

## 3. Clinical UI/UX Principles
- **Source Grounding**: Always allow operators to compare extracted biomarker values side-by-side against the original scanned lab report before saving to the e-CRF registry.
- **Confidence Triage**: Highlight fields with `< 85%` OCR confidence in amber (`Needs Review`) and require human verification or inline editing before committing to the registry.
- **Calm Clinical Aesthetic**: High-contrast, accessible light-mode clinical palette (Slate/Porcelain surfaces, Medical Teal primary actions, Vinmec Navy accents, Amber review flags, Rose abnormal lab flags). Avoid dark-mode neon/purple gradients or cluttered bento grids.

## 4. Development & Verification Commands
```bash
# Run development server (http://localhost:3000)
npm run dev

# Build production bundle & run TypeScript/route type checks
npm run build

# Run ESLint
npm run lint
```
