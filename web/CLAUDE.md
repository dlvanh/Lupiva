# CLAUDE.md — Lupiva Project Guide

This file provides context and workflow instructions for Claude Code and AI coding assistants working in the **Lupiva** repository.

## Project Overview
**Lupiva** (*Intelligent SLE Registry & Patient Companion Platform*) is a healthcare web application developed for the **Vinmec Innovation Challenge 2026** (Domain: *Clinical Immunology & Allergy*). It streamlines Systemic Lupus Erythematosus (SLE) care through:
1. **Automated Lab Report OCR & Standardization**: Extracting lupus biomarkers (`ANA`, `Anti-dsDNA`, `Complement C3/C4`, `24h Urine Protein`, `CBC`) from paper/PDF clinical lab reports into standardized Electronic Case Report Forms (**e-CRF**).
2. **Physician-in-the-Loop (HITL) Verification**: Side-by-side document grounding with bounding boxes and confidence thresholds (`Needs Review` below 85% confidence) so no unverified OCR error enters the clinical registry.
3. **Patient Companion & Registry Consent**: Connecting consenting SLE patients with Vinmec Clinical Immunology specialists.

## Common Commands
- `npm run dev` — Start the Next.js development server on `http://localhost:3000`.
- `npm run build` — Run production build, Next.js route type generation, and TypeScript verification.
- `npm run lint` — Run ESLint across `src/`.

## Directory Structure
```text
Lupiva/
├── AGENTS.md                   # Multi-agent rules (includes Next.js 16 rule header)
├── CLAUDE.md                   # Claude Code project guide
├── README.md                   # Executive summary, workflow diagrams & Vinmec roadmap
├── src/
│   ├── app/
│   │   ├── globals.css         # Tailwind CSS v4 import & custom clinical utilities
│   │   ├── layout.tsx          # Root layout with Google Fonts, LupivaProvider & Navbar
│   │   ├── page.tsx            # Landing Page (/)
│   │   ├── login/
│   │   │   └── page.tsx        # Role-aware Login Page (/login)
│   │   └── ocr/
│   │       └── page.tsx        # Split-Screen Document OCR & e-CRF Workspace (/ocr)
│   ├── components/
│   │   └── Navbar.tsx          # Global navigation bar, Action Guide modal & toast banner
│   ├── context/
│   │   └── LupivaContext.tsx   # Shared state (auth user, active report, saved e-CRF records)
│   └── data/
│       └── mockData.ts         # Mock SLE lab reports, bounding boxes, demo users & button map
```

## Key Implementation Notes
- **Next.js 16 App Router**: Always check `node_modules/next/dist/docs/` when using newer Next.js APIs. Keep `<!-- BEGIN:nextjs-agent-rules -->` intact at the top of `AGENTS.md`.
- **Interactive Mock Data (`src/data/mockData.ts`)**: All buttons in the UI are wired to deterministic state updates so clinical evaluators can test the end-to-end flow without an external backend.
- **Typography**: Uses `Plus Jakarta Sans` (`--font-jakarta`) for UI copy and `JetBrains Mono` (`--font-jetbrains-mono`) for quantitative lab values, units, reference ranges, and OCR confidence percentages.
