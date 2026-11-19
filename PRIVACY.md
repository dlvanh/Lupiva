# Privacy and data handling

This repository contains **code and synthetic test data only**. No patient record, image, export or database has ever been committed.

## What is in the repository
- `examples/pool-tests/images/SYN-*.png`: four generated lab tables printed with "SYNTHETIC DATA – no patient information".
- Test fixtures use made-up names, phone numbers, ID numbers and `@example.test` addresses, including deliberately PII-shaped strings that exercise the scrubbers.
- Local inputs, OCR outputs, research runs, databases, backups and `.env` files are excluded by `.gitignore`.

## Data flow at run time
1. **Upload**: patients sign electronic consent and upload photos to the web app (`web/`), which stores them on the hospital-side server.
2. **Local OCR and de-identification**: OCR (SenOCR-Vi, PP-DocLayout) runs on an on-premise GPU. Identifier regions (names, IDs, dates of birth, phone numbers, addresses, e-mail, staff names) are cropped out or masked (`registry_review/privacy.py`, `ocr_pool/privacy_*.py`).
3. **Outgoing gate (fail-closed)**: `ocr_pool/outgoing_gate.py` re-reads the prepared bytes locally and blocks the page if any identifying text is still visible.
4. **LLM extraction**: only the masked page crops, with the matching local OCR lines, are sent to the configured LLM API (`*_BASE_URL`, HTTPS or local loopback only). The web app makes no third-party calls (no analytics, e-mail or telemetry).
5. **Human review**: every value stays pending until a specialist approves it against the source; exports to REDCap contain approved values only.

## Experimental flows
| Flow | How to run | What leaves the machine |
|---|---|---|
| A. Direct LLM | `LUPIVA_PROTOTYPE_DIRECT_LLM=1` | Whole unmasked image. **Synthetic images only.** |
| B. OCR → mask → LLM | default intake path / `scripts/run_llm_pool.py` | Masked page crops + local OCR lines, after the outgoing gate |
| C. Hybrid | `scripts/run_hybrid_pool.py` | Nothing for pages local OCR settles; flow B for the rest |

## Reporting
Report a suspected privacy issue privately to the maintainers rather than in a public issue.
