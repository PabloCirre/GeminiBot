# PIBOT Release Notes

## 1.2.0 - FREE BIRD UX and Per-Bot Models

Date: 2026-04-01

### Highlights

- Reworked the settings experience around a simpler mental model:
  install models once, choose a default, then assign one model per bot.
- Made `FREE BIRD` the visible local-first path again when cloud credentials are not configured.
- Hid Google OAuth credentials behind an expandable section so they do not compete with local setup.
- Added one-click install and uninstall language that clearly explains what happens.

### Model Runtime

- Added a clearer local model library view for installed and suggested models.
- Kept advanced runtime controls available, but moved them behind an explicit advanced section.
- Confirmed `FREE BIRD` works with local Ollama and `qwen2.5:1.5b`.

### Agent UX

- Added model assignment directly in the create/edit bot flow.
- Persisted one model per bot instead of relying only on one global model.
- Displayed the assigned model on each bot card.
- Updated runtime execution so each bot uses its own configured model.

### Cloud Setup

- Added local `.env` loading for Google OAuth client id and client secret.
- Kept cloud credentials hidden by default in the UI.

### Notes

- Google OAuth is wired, but Google model generation is still not connected to the provider runtime.
- Settings and bot state still persist in local app storage.
