# CLAUDE.md — Lupiva Project Guide

This file provides context and workflow instructions for Claude Code and AI coding assistants working in the **Lupiva** repository.

## Project Overview
**Lupiva** (*Intelligent SLE Clinical Registry & Patient Companion Platform*) is a bilingual (`EN`/`VI`) Next.js web application developed for the **Vinmec Innovation Challenge 2026** (Domain: *Clinical Immunology & Allergy*). It streamlines Systemic Lupus Erythematosus (SLE) clinical data collection and scoring through:
1. **Patient Document Upload (`/upload`)**: Patients upload lab images/PDFs and track dossier review status (`Pending Doctor Review` → `Approved`).
2. **Physician-in-the-Loop (HITL) OCR & 6-Section SLE e-CRF (`/ocr`, `/crf`)**: Side-by-side document grounding with **3-tier OCR confidence triage** (`>90%` auto-approved, `80–90%` needs verification, `<80%` left blank for manual entry from the scan), antibody blot panels, a `.docx`-style printable CRF view (`DocxCrfView`), and a 3-step doctor workflow (`Resolve flagged OCR` → `Review CRF & scores` → `Approve & Scores`).
3. **SLE Scoring (`/scores`)**: Interactive and printable **2019 EULAR/ACR Classification Criteria** and **SLEDAI-2K Disease Activity** tables (`SleScoreTables`) synced from verified OCR results.

## Common Commands
- `npm run dev` — Start the Next.js development server on `http://localhost:3000`.
- `npm run build` — Run production build, Next.js route type generation, and TypeScript verification.
- `npm run lint` — Run ESLint across the repository.

## Directory Structure
```text
Lupiva/
├── AGENTS.md                        # Multi-agent rules (includes Next.js 16 rule header)
├── CLAUDE.md                        # Claude Code project guide
├── README.md                        # Executive summary, workflow diagrams & Vinmec roadmap
├── next.config.ts                   # Next.js 16 config (cacheComponents, partialPrefetching, Turbopack CSS)
├── src/
│   ├── app/
│   │   ├── globals.css              # Tailwind CSS v4 import, tabular-nums, skip-link & OCR scan animation
│   │   ├── layout.tsx               # Root layout with Google Fonts, LupivaProvider & Navbar
│   │   ├── page.tsx                 # Landing Page (/)
│   │   ├── login/
│   │   │   └── page.tsx             # Role-aware Login Page (/login)
│   │   ├── upload/
│   │   │   └── page.tsx             # Patient Document Upload Portal & Submission Queue (/upload)
│   │   ├── crf/
│   │   │   └── page.tsx             # 3-Step Doctor OCR & 6-Section SLE e-CRF Workspace (/crf)
│   │   ├── ocr/
│   │   │   └── page.tsx             # Re-exports src/app/crf/page.tsx (/ocr)
│   │   └── scores/
│   │       └── page.tsx             # 2019 EULAR/ACR & SLEDAI-2K Scoring Page (/scores)
│   ├── components/
│   │   ├── Navbar.tsx               # Role-adaptive navbar, EN/VI toggle, toast banner & Action Guide modal
│   │   ├── DocxCrfView.tsx          # Print-ready .docx-formatted SLE Case Report Form view
│   │   └── SleScoreTables.tsx       # Reusable 2019 EULAR/ACR & SLEDAI-2K scoring tables
│   ├── context/
│   │   └── LupivaContext.tsx        # Shared state (auth, language, crfPatients, uploads, savedRecords, toast)
│   └── data/
│       ├── crfData.ts               # SLE e-CRF types, initial cohort records, 3-tier triage & score calculators
│       ├── mockData.ts              # Demo users, landing preview lab reports & BUTTON_ACTION_MAP
│       └── translations.ts          # EN/VI translation dictionary & localized mock data helpers
```

## Key Implementation Notes
- **Next.js 16 App Router**: Always check `node_modules/next/dist/docs/` before using newer Next.js APIs (`next.config.ts` enables `cacheComponents: true` and `partialPrefetching: true`). Keep `<!-- BEGIN:nextjs-agent-rules -->` intact at the top of `AGENTS.md`.
- **Route Aliases**: `/ocr` (`src/app/ocr/page.tsx`) directly re-exports `src/app/crf/page.tsx` so both URLs serve the unified split-screen OCR & SLE e-CRF workspace.
- **3-Tier OCR Confidence Logic (`src/data/crfData.ts`)**: Implemented in `getInitialOcrTierStatus(confidence)` — `>90%` becomes `"auto_approved"`, `80–90%` becomes `"needs_verify"`, and `<80%` becomes `"manual_required"` (rendered blank initially until the user inspects the source scan and enters/verifies the value).
- **Bilingual EN/VI Support**: Shared strings live in `src/data/translations.ts`, while `crf/page.tsx`, `upload/page.tsx`, `scores/page.tsx`, `DocxCrfView.tsx`, and `SleScoreTables.tsx` also branch on `language === "vi"` (`isVi`). Update both languages when adding UI copy.
- **Clinical UI & Typography**: Uses `Plus Jakarta Sans` (`--font-jakarta`) for UI copy and `JetBrains Mono` (`--font-jetbrains-mono`) with `tabular-nums` for quantitative lab values, units, reference ranges, and confidence scores. Keep the light-mode clinical palette clean, accessible, and free of decorative emojis.
