<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Lupiva — Agent Development Guidelines (`AGENTS.md`)

**Lupiva** is an Intelligent Systemic Lupus Erythematosus (SLE) Clinical Registry & Patient Companion Platform built for the **Vinmec Innovation Challenge 2026**.

## 1. Architecture & Tech Stack
- **Framework**: Next.js 16 (`^16.4.5`, App Router, `cacheComponents: true` & `partialPrefetching: true` in `next.config.ts`) with React 19 (`^19.3.0`)
- **Language**: TypeScript 5 (`strict: true`)
- **Styling**: Tailwind CSS v4 (`@import "tailwindcss";` in `src/app/globals.css`, `@tailwindcss/turbopack`)
- **State, Localization & Mock Data**:
  - `src/data/crfData.ts`: Canonical SLE e-CRF schema (`SleCrfPatientRecord`, `CrfOcrField`, `CrfAntibodyBlotRow`, `OcrTierStatus`), initial patient records (`INITIAL_CRF_PATIENTS`), 3-tier confidence helper (`getInitialOcrTierStatus`), EULAR/ACR 2019 & SLEDAI-2K calculators (`calculateEularAcrSummary`, `calculateSledai2kSummary`), and `syncCriteriaFromVerifiedCrf`.
  - `src/data/mockData.ts`: Demo personas (`DEMO_USERS`), landing preview lab report datasets (`MOCK_LAB_REPORTS`), and `BUTTON_ACTION_MAP`.
  - `src/data/translations.ts`: Bilingual English/Vietnamese dictionary (`TRANSLATIONS`) and localized helpers (`getLocalizedDemoUsers`, `getLocalizedLabReports`, `getLocalizedButtonActionMap`).
  - `src/context/LupivaContext.tsx`: Shared client context (`LupivaProvider`, `useLupiva`) managing `language` (`"en" | "vi"`, persisted in `localStorage` under `"lupiva-lang"`), role-based session state (`currentUser`), `crfPatients` & `activeCrfPatientId`, `submitPatientUpload`, `createNewCrfPatient`, `savedRecords`, toast notifications, and the UI Button Action Guide modal.

## 2. Core Application Routes & Components
1. **Landing Page (`src/app/page.tsx` -> `/`)**:
   - Presents the SLE clinical registry (e-CRF) value proposition, 3-tier confidence preview card, 3-step Physician-in-the-Loop (HITL) workflow, sample lab report cards, and an interactive Button Action Guide trigger.
2. **Authentication Page (`src/app/login/page.tsx` -> `/login`)**:
   - Supports switching between **Vinmec Clinical Specialist** (`Dr. Nguyen Minh, MD, PhD`) and **SLE Registry Patient** (`Tran Thi Mai`), one-click demo credential autofill, and an informed consent requirement for patient submissions. Redirects patients to `/upload` and specialists to `/ocr`.
3. **Patient Upload Portal (`src/app/upload/page.tsx` -> `/upload`)**:
   - Drag-and-drop image/PDF dossier uploader with sample hospital dossier loader, live patient submission queue (`Pending Doctor Review` vs. `Approved`), and one-click specialist handoff into `/ocr`.
4. **Doctor OCR & SLE e-CRF Workspace (`src/app/crf/page.tsx`, re-exported at `src/app/ocr/page.tsx` -> `/ocr` & `/crf`)**:
   - **Left Pane (Source Document Viewer)**: Displays patient-uploaded files or grounded multi-panel clinical scan sheets (`Immunology`, `Renal`, `Hematology`, `Infectious`, `PFT`) with simulated OCR pass and field-level highlighting.
   - **Right Pane (Guided 3-Step Workflow & 6-Section e-CRF)**:
     - `step1_triage`: Resolve `<80%` manual-entry and `80–90%` verification OCR fields & antibody blot panels (`ANA Profile 23`, `Myositis 16`).
     - `step2_review`: Edit all 6 e-CRF sections (`demographics`, `medical_history`, `organs_damage`, `immunology`, `eular_acr`, `sledai_2k`).
     - `step3_signoff`: Toggle clean `.docx`-formatted CRF preview (`src/components/DocxCrfView.tsx`), export `<studyId>-sle-crf.json`, and sign off to publish verified SLE scores.
5. **SLE Classification & Disease Activity Scores (`src/app/scores/page.tsx` + `src/components/SleScoreTables.tsx` -> `/scores`)**:
   - Displays **2019 EULAR/ACR Classification Criteria** and **SLEDAI-2K Disease Activity** tables with OCR hint badges, `Sync from Verified OCR` action, and print support.
6. **Global Navigation (`src/components/Navbar.tsx`)**:
   - Role-adaptive primary navigation, patient queue count badge, compact `EN` / `VI` language switcher, auto-dismissing toast banner, skip-to-content link, and Button Action Guide modal.

## 3. Clinical UI/UX & Engineering Principles
- **Source Grounding**: Always allow operators to compare extracted biomarker values side-by-side against the original scanned lab report or uploaded document before signing off.
- **3-Tier Confidence Triage**:
  - `>90%` (`auto_approved`): Auto-populated and approved.
  - `80–90%` (`needs_verify`): Pre-filled and highlighted in amber for explicit human verification or inline editing.
  - `<80%` (`manual_required`): Left blank initially and flagged in rose so the clinician inspects the original scan and enters the value manually.
- **Calm Clinical Aesthetic & Accessibility**: High-contrast, accessible light-mode clinical palette (Slate/Porcelain surfaces, Medical Teal primary actions, Amber verification flags, Rose manual/abnormal flags). Avoid decorative emojis in clinical UI and dark-mode neon gradients; maintain `tabular-nums` on quantitative tables/inputs, semantic landmarks, and keyboard focus outlines.

## 4. Development & Verification Commands
```bash
# Run development server (http://localhost:3000)
npm run dev

# Build production bundle & run TypeScript/route type checks
npm run build

# Run ESLint
npm run lint
```
