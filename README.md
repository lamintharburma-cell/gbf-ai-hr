# G.B.F. Enterprise HR & AI Management System (v9.3.0 Production LTS)

Zero-cost Serverless Enterprise Workforce Telemetry, Gamified MLBB KPI/Rewards, 50% Advance Wallet, Multi-Approver Telegram Sync & Durable Receipts, Scoped Group Live Attendance Board (`LIVE_EDIT`, Pending Drilldown, Field Team Readiness, Forum Topic Threading & Scheduled 09:20 / 18:15 Digests), Signed Telegram Identity SSO, WCAG 2.1 AA Dark Slate UI & Compact Month Switcher, and Gemini 3.8 Flash HR-AI Platform powered by Google Sheets + Google Apps Script + Telegram Native Mini App.

---

## 📁 Standardized Project Structure (`c:\v9.1_GBF_AI_HR`)

```text
c:\v9.1_GBF_AI_HR\
├── .clasp.json                     # Apps Script CLI mapping (scriptId + rootDir: "src")
├── jsconfig.json                   # IDE JS/GS configuration (resolves TS18003)
├── README.md                       # Deployment & Verification Runbook
├── docs\
│   └── GBF_HRMS_Capabilities_and_User_Manual.md  # Comprehensive Burmese User & Admin Guide (v9.3.0)
├── src\                            # Production Apps Script Source Root
│   ├── appsscript.json             # V8 runtime, Asia/Rangoon timezone, OAuth scopes, WebApp access
│   ├── Config.gs                   # Constants, credentials, formatAiToTelegramHtml, clock/maps helpers
│   ├── Database.gs                 # 10-table schema migration & ATT-timestamp recovery
│   ├── GeminiAI.gs                 # Gemini 3.8 Flash Interactions API (/v1beta/interactions)
│   ├── TelegramIdentity.gs         # HMAC-SHA256 signed Mini App URLs, /link PIN, conflict guards
│   ├── TelegramBot.gs              # Webhook, Scoped Bot/Group Live Board, Multi-Approver sync & Digests
│   ├── PayrollEngine.gs            # Gamified KPI, weekly MVP streaks, 3-AFK forfeiture, batch payroll
│   ├── Code.gs                     # doGet, doPost (direct HTTP 200 ack), RBAC guard, idempotency
│   └── Index.html                  # Dark Slate Mini App, Advance Quick Chips, Custom Month Switcher
├── tests\
│   └── smoke.test.mjs              # Node.js built-in test runner suite (9 test suites)
└── _legacy_backup\                 # Unmodified backup of original v9.1 files
```

---

## 🔗 Live Environment Identifiers

- **Apps Script Project ID:** `1yp2S7zYgTB-bUfBVX9RwSC4HGs9ZKLoaSwjXn2ZTv5fpruUm-g9n49hl`
- **Google Sheet (`GBF HR Master Database`):** `1J13zp0CF3Pogq3ijRMWPl0fJNFliNjzzHsXUU_6VEyw`
- **Telegram Bot:** `@GBF_HRMS_Bot`
- **AI Model / Endpoint:** `gemini-3.8-flash` via `https://generativelanguage.googleapis.com/v1beta/interactions` (`x-goog-api-key`)

---

## 🚀 Deploying to Google Apps Script

### Option A: Automated Push via `clasp`
1. Authenticate once with Google Apps Script CLI:
   ```powershell
   npx @google/clasp login
   ```
2. Push all `src/` files to the Apps Script project (`1yp2S7zYgTB-bUfBVX9RwSC4HGs9ZKLoaSwjXn2ZTv5fpruUm-g9n49hl`):
   ```powershell
   npx @google/clasp push
   ```
3. In the Apps Script Editor, either add `BOT_TOKEN` & `GEMINI_API_KEY` directly in **Project Settings -> Script Properties**, or run **`configureGBFProductionCredentials(botToken, geminiKey)`** once (sets `BOT_TOKEN`, `GEMINI_API_KEY`, `SPREADSHEET_ID`, `WEB_APP_URL` in Script Properties), then deploy a new Web App version and run **`runSystemDiagnostics()`**.

### Option B: Manual Copy-Paste in Apps Script Editor
1. Open the Apps Script project for Sheet `1J13zp0CF3Pogq3ijRMWPl0fJNFliNjzzHsXUU_6VEyw` (Script ID: `1yp2S7zYgTB-bUfBVX9RwSC4HGs9ZKLoaSwjXn2ZTv5fpruUm-g9n49hl`).
2. Enable **Project Settings -> Show "appsscript.json" manifest file in editor** and paste `src/appsscript.json`.
3. Create/update script files matching each file in `src/`:
   - `Config.gs`
   - `Database.gs`
   - `GeminiAI.gs`
   - `TelegramIdentity.gs`
   - `TelegramBot.gs`
   - `PayrollEngine.gs`
   - `Code.gs`
   - `Index.html` (HTML file named `Index`)
4. Save all files, set `BOT_TOKEN` & `GEMINI_API_KEY` in **Project Settings -> Script Properties** (or run **`configureGBFProductionCredentials(botToken, geminiKey)`** once), then **Deploy -> Manage deployments -> Edit -> New version -> Deploy**.
5. Run **`setupWebhook()`**, **`installGroupDigestTriggers()`** (once, to enable automated `09:20 AM` & `06:15 PM` Mon–Sat Group Digests), and **`runSystemDiagnostics()`** to verify Telegram Bot, Gemini 3.8 Flash Interactions API, and Spreadsheet connectivity.

---

## ✅ Automated Verification

Run the built-in Node.js verification suite:
```powershell
node --test tests/smoke.test.mjs
```
