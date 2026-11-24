# G.B.F. Enterprise HR & AI — UI/UX Streamlining & Pro-Stack Redesign Plan (`v10.0`)

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` or `superpowers:executing-plans` AFTER user selects an option (`Option B2` / `Option B1` / `Option A`) and approves this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cut redundant calendar/chrome clutter from the Home dashboard so Check-In leads above the fold, fix desktop navigation overlap and typography/accessibility gaps, and migrate from a monolithic single-file GAS `Index.html` + Google Sheets OLTP stack to professional design & engineering tooling (**`StitchMCP` + `React 19` + `TypeScript` + `Vite` + `Tailwind CSS v4` + `shadcn/ui` + `mcp-server-neon` PostgreSQL + Netlify**).

**Architecture:** Three progressive delivery tracks (**Phase 0:** `StitchMCP` visual design & `DESIGN.md` OKLCH tokens -> **Phase 1:** Modular compiled React/TypeScript/shadcn/ui SPA with `React DayPicker` & `Recharts` + unified `History & Daily Squad Archive` -> **Phase 2:** `mcp-server-neon` PostgreSQL backend with Zod-validated Netlify Functions, signed JWT/Telegram `initData` auth, and async Google Sheets Finance/HR reporting sync).

**Tech Stack:**
- **Design Prototyping:** `StitchMCP` (`DESIGN.md` semantic tokens) + optional `figma_figma` sync
- **Frontend:** `React 19`, `TypeScript`, `Vite`, `Tailwind CSS v4` (compiled CSS, zero runtime CDN), `shadcn/ui` (`Radix` primitives), `React DayPicker` (`Asia/Yangon`), `Recharts` / SVG radar, `Lucide React`, `Motion`, `TanStack Query`, `vite-plugin-pwa` + `IndexedDB`
- **Backend & DB:** `mcp-server-neon` (Serverless PostgreSQL) + `Netlify Functions` + `Zod` + Signed Session JWT + HMAC Telegram Verification + Google Sheets async reporting sync (`src/PayrollEngine.gs` KPI formula parity)
- **Verification:** `Vitest`, `React Testing Library`, `Playwright` (`320px` / `375px` / `1280px` desktop, Light & Dark, `TZ=Asia/Yangon`), plus `chrome-devtools` live runtime audit

---

## Global Constraints (Inherited & Non-Negotiable)

- **Viewport & Scaling:** `width=device-width, initial-scale=1.0, viewport-fit=cover` — NEVER set `user-scalable=no` or `maximum-scale=1.0` (`WCAG 1.4.4`).
- **Myanmar Unicode & Typography:** `line-height: 1.65`, `overflow-wrap: anywhere`, `tabular-nums` on all numeric/date metrics, UI text floor `>= 12px` (captions `12–13px`, body `14–16px`, mobile inputs `>= 16px` to prevent iOS auto-zoom).
- **Touch Targets & Motion:** All interactive buttons `>= 44×44px` on touch (`>= 40×40px` desktop); all non-opacity transforms wrapped in `@media (prefers-reduced-motion: no-preference)`.
- **Timezone Safety:** 100% pure `Asia/Yangon` (`GMT+6:30`) date helpers and UTC-pinned calendar arithmetic (never bare local midnight `"T00:00:00"` + `.toISOString()`).
- **Formula Parity (`KPI_Formula_Registry`):** Preserve exact v9.4 Path B math (`Win Rate = (MVP+OnTime)/(MVP+OnTime+Late+AFK)`, dynamic `WORKING_DAYS_YYYY_MM`, Field Ops vs Non-Op Team Spirit, `3+ AFK` bonus forfeiture, `hasSquadMemberName` exact member token matching).
- **Workspace & Archive Guard:** Active source inside `c:\v9.1_GBF_AI_HR\`; never touch `_legacy_backup\`, never store project files on Desktop, never commit secrets/tokens.

---

## Part 1: Verified `better-interface` Audit (Current `v9.4.0` Baseline)

**Scope Reviewed:** `#app-view` sticky header (`src/Index.html:981-1029`), `#tab-home` (`src/Index.html:1036-1415`), `#tab-logs` (`1541`), `#bottom-nav` (`2033-2057`), root styling (`180-310`), Tailwind/Chart CDN scripts (`21, 75`), plus rendered screenshots `02_home_attendance_hq.png`, `03b_home_mlbb_radar.png`, `06_history_calendar_timeline.png`, and `v940_desktop_dark.png`.  
*(Other tabs `#tab-wallet`, `#tab-leave`, `#tab-advance`, `#tab-voice`, `#tab-team`, `#tab-ai` were inspected only for outer DOM structure and are `Not reviewed` in full detail.)*

### Domain Coverage Summary
| Domain | Status | Primary Evidence Inspected |
| :--- | :--- | :--- |
| `better-accessibility` | Reviewed | `Index.html:983, 1055, 1063, 1270, 2033`, modal focus/keyboard structure |
| `better-layout` | Reviewed | `Index.html:1039-1077, 1401-1412, 2033`, `v940_desktop_dark.png`, `02_home_attendance_hq.png` |
| `better-writing` | Reviewed | `Index.html:988-1067, 1407`, Bilingual copy mix |
| `better-typography` | Reviewed | `Index.html:218-249, 989, 1067, 1129, 1219, 1235, 1250` |
| `better-colors` | Reviewed | `Index.html:180-216, 1217-1290`, inline literal gradient styles & mixed notation |
| `better-ui` | Reviewed | `Index.html:286-305, 1052, 1084, 1208`, `:hover` gating & card radii |
| `better-motion` | Reviewed | `Index.html:1088, 1269`, theme transition & carousel indicator |

### Ranked Findings Table
| Severity | Domain | Location & Evidence | Impact & Root Cause | Pro Fix (`Delete -> Platform -> Token`) |
| :--- | :--- | :--- | :--- | :--- |
| **`HIGH`** | `better-layout` | `src/Index.html:1039-1077`, `1401-1412`, `02_home_attendance_hq.png`, `v940_desktop_dark.png` | **3 competing calendar/jump blocks** (`Nov '26` header dropdown + `#hbeam` jump strip + ~240px `#home-calendar-top-card` + bottom Calendar link) push `#1 Primary Action` (`GPS CHECK IN`) halfway down the screen on mobile. | **Delete** `#home-calendar-top-card`, `#hbeam-0..2`, and bottom Calendar card (`L1401`). Put `GPS CHECK IN` at top of Home; keep a single `40px` today-squad chip linking to unified **History & Squad Archive**. |
| **`HIGH`** | `better-layout` | `src/Index.html:2033`, `v940_desktop_dark.png` | **`#bottom-nav` is `fixed` with `max-w-lg` and zero `lg:hidden` / sidebar layout** -> floats across content at `1280×800` desktop, overlapping `[ဝင်ပြီး (3)]` Roster rows and bottom Radar labels. | **Adaptive App Shell:** Left Sticky Sidebar (`240px`) for `lg:` (`>=1024px`) desktop, bottom Tab Bar strictly `<1024px` mobile/tablet with matched scroll-padding. |
| **`HIGH`** | `better-accessibility` | `src/Index.html:983` (`<div onclick="exitCurrentView()">`) | **Clickable `<div>`** fails keyboard focus & screen-reader role (`WCAG 2.1.1 / 4.1.2`). Missing Skip Link and native `<dialog>` focus-trapped modals. | **Use Platform:** `<button type="button">` for header home trigger, native Radix/`<dialog>` overlays with focus restore, `<a href="#main-content">` Skip Link. |
| **`HIGH`** | `better-accessibility` | `src/Index.html:1055, 1058, 1063` (`w-7 h-7` = `28×28px`) | Week chevron & calendar header buttons fall below `44×44px` mobile touch ergonomics when `#home-calendar-top-card` renders. | Delete bloated top calendar; use `44×44px` `.touch-target` DayPicker nav buttons inside dedicated History route. |
| **`MEDIUM`** | `better-typography` | `src/Index.html:989, 1067, 1129, 1219, 1235, 1250` (`text-[7.5px]` to `text-[9px]`) | Sub-11px Burmese/English labels strain outdoor mobile reading in sunlight (`better-typography` floor: captions `12–13px`, badges `11–12px`). | Standardize Tailwind typography tokens (`text-xs` = `12px`, `text-sm` = `14px`, `text-base` = `16px`) with compiled `@theme` scale. |
| **`MEDIUM`** | `better-colors` / `better-ui` | `src/Index.html:21, 75, 180-216` (`cdn.tailwindcss.com`, runtime JIT, inline CSS gradients) | Runtime JIT CDN causes load lag inside nested GAS `HtmlService` iframe; hex + `rgba` literals scattered inline instead of semantic role tokens (`--color-surface-*`, `--color-status-*`). | Compile **Tailwind CSS v4 + `shadcn/ui` OKLCH role tokens** cleanly via Vite (`<100ms` cached static shell, zero GAS `Caja` iframe traps). |
| **`MEDIUM`** | `better-motion` | Theme toggle (`toggleDarkMode`) + `L1088` (`animate-ping`) + `L1307-1309` | Theme swap can smear transitions across cards; unhydrated initial progress bar width (`68%/27%/5%`) flickers before telemetry arrives. | Disable CSS transitions for 1 frame on theme switch; render deterministic skeleton states before `TanStack Query` hydration. |

---

## Part 2: Architecture Upgrade Comparison (`Dual-Path` Matrix)

| Dimension | Option A: Trim `Index.html` Only | Option B1: Pro UI SPA + Existing GAS Backend | Option B2: Full Pro Stack (**CTO Recommended**) |
| :--- | :--- | :--- | :--- |
| **Calendar & Home Cleanup** | Cuts `#home-calendar-top-card`, `#hbeam`, duplicate bottom link, fixes desktop nav. | Same clean UX rebuilt cleanly in **React + `shadcn/ui` + `React DayPicker`**. | Same clean UX + deep date filtering via SQL queries. |
| **Design Tooling** | Manual HTML/CSS edits | **`StitchMCP` + `DESIGN.md` OKLCH system** (reviewed before build). | **`StitchMCP` + `DESIGN.md` OKLCH system** + component specs. |
| **Frontend Runtime** | `5,152-line` monolith, Tailwind JIT CDN inside GAS iframe | **React 19 + TS + Vite + Tailwind v4 + `shadcn/ui` + PWA** on Netlify. | **React 19 + TS + Vite + Tailwind v4 + `shadcn/ui` + PWA** on Netlify. |
| **Database & Concurrency** | Google Sheets + `LockService` queue (8.5s–25s timeouts) | Transitional GAS `/exec` adapter (`Code.gs`), still GAS bottleneck. | **`mcp-server-neon` PostgreSQL** (`ms` latency, ACID, FK/indexes, async Sheets mirror). |
| **Security & Auth** | Standalone PIN (`emp_id` tech debt remains) | Signed short-lived session token wrapper if added to GAS `Code.gs`. | **Real Signed JWT + Telegram `initData` HMAC + Zod + Server RBAC**. |

---

## Part 3: Target Information Architecture (`Home` Simplified Flow)

```text
+------------------------------------------------------------------+
| HEADER: [GBF Logo Button]   [Period: Nov '26 v]  [Theme] [Avatar]|
+------------------------------------------------------------------+
| (Desktop >=1024px)  | MAIN CONTENT (#main-content)               |
| Left Sidebar Rail:  | 1. GPS ARENA (CHECK IN / OUT + 500m Gauge) |
| - Home (ပင်မ)        |    + Compact 1-line Chip:                  |
| - History (ပြက္ခဒိန်)|    "[Nov 24 · Team Alpha · Past Days ▸]"   |
| - Payslip (Wallet)  | 2. SEASON MASTERY HUD (3 Rings + Radar)   |
| - HR-AI Voice       | 3. TODAY CHECK-IN ROSTER (Expandable)      |
| - Admin (RBAC)      | 4. ACTIVE BATTLE SQUADS (My Squad First)   |
| - + Quick Action    |                                            |
+------------------------------------------------------------------+
  * Mobile <1024px: Sidebar collapses into Safe-Area Bottom Nav.
  * Past-Date Inspection (Check-In + Assigned Squad by Date) moves cleanly
    into the dedicated "History" tab powered by `React DayPicker`.
```

---

## Part 4: Target Repository & Modular File Structure (For `Option B1` / `Option B2`)

Keep current Apps Script code untouched in `src/` during parallel rollout until live cutover, scaffolding the modular app cleanly inside `web/` (or dedicated branch `feat/v10-pro-ui`) plus `api/` (Netlify Functions + Neon Drizzle/SQL migrations):

```text
c:\v9.1_GBF_AI_HR\
├── DESIGN.md                              # Semantic OKLCH token constitution (Dark Astral & Light Ice)
├── web\                                   # Compiled Vite + React 19 + TypeScript + shadcn/ui SPA
│   ├── package.json
│   ├── vite.config.ts                     # PWA + Tailwind v4 + alias setup
│   ├── src\
│   │   ├── main.tsx
│   │   ├── styles\tokens.css              # OKLCH palette, Myanmar line-height: 1.65, motion gates
│   │   ├── lib\
│   │   │   ├── date-yangon.ts             # Pure Asia/Yangon ISO & workday math (100% UTC-safe)
│   │   │   ├── kpi-engine.ts              # Shared TypeScript port of PayrollEngine Path B rules
│   │   │   ├── api-client.ts              # Auth-aware TanStack Query client + offline IndexedDB queue
│   │   │   └── telegram-sdk.ts            # Native WebApp initData HMAC extractor & safe map/tel links
│   │   ├── components\
│   │   │   ├── ui\                        # shadcn/ui primitives (Button, Dialog, Sheet, Tabs, Calendar)
│   │   │   ├── layout\AppShell.tsx        # Desktop Sidebar + Mobile Bottom Nav (<1024px) + Skip Link
│   │   │   ├── home\
│   │   │   │   ├── GpsArenaCard.tsx       # Primary Check-In/Out + HQ Distance bar + 1-line Squad Chip
│   │   │   │   ├── MasteryHudCard.tsx     # 3 Rings + 4-Chip Strip + Recharts/SVG 5-Axis Radar
│   │   │   │   ├── RosterCard.tsx         # Check-In / Leave / Pending inspector
│   │   │   │   └── BattleSquadsCard.tsx   # Exact hasSquadMemberName parser
│   │   │   ├── history\HistoryView.tsx    # Unified React DayPicker Calendar + Timeline + Day Squad Snapshot
│   │   │   ├── wallet\WalletView.tsx      # 50% Advance Wallet + Official Payslip viewer
│   │   │   ├── forms\QuickActionModals.tsx# Native Dialogs/Drawers (Leave, Advance, Voice, Squad)
│   │   │   └── admin\AdminConsole.tsx     # AI Watchlist, Payroll Runner, Working Days & Formula Registry
│   │   └── __tests__\                     # Vitest unit & component tests
│   └── e2e\                               # Playwright visual/contrast/overflow tests (320/375/1280px)
├── netlify\functions\                     # (Option B2) Zod-validated REST API + JWT Auth + Neon SQL + Async Sheets sync
├── db\migrations\                         # (Option B2) Neon PostgreSQL normalized DDL + Formula seed
└── src\                                   # Existing v9.4.0 GAS + TelegramBot (kept running & synced)
```

---

## Part 5: Execution Tasks (Test-First, Phased & Verifiable)

### Review Focus (5 Edge Cases Any Reviewer Should Check)
1. **Yangon Timezone Boundary (`+06:30` at `23:30–00:29`):** Switching between UTC midnight and `Asia/Yangon` must never cause a 1-day shift in `React DayPicker`, `Daily/Weekly` history filters, or check-in timestamps.
2. **Exact Squad Member Token Isolation (`"Ko Myo"` vs `"Ko Myo Thant Zaw"`):** Shared `hasSquadMemberName` helper tested across unit tests and UI `YOU` badge rendering so prefix names never collide.
3. **320px/375px Mobile vs 1280px Desktop Chrome Isolation:** Zero bottom-nav overlap on desktop (`>=1024px`), `>= 44px` hit areas on mobile, `>= 16px` input font size, `0px` horizontal overflow.
4. **Offline Check-In / Advance Queue (`IndexedDB` + `idempotencyKey`):** Rapid double-tap or flaky field connection must enqueue cleanly once and replay idempotently without duplicate payroll/attendance writes.
5. **Auth & Payslip RBAC:** An employee (`#3013`) requesting `#1001`'s payslip or calling `generate-payroll` / `sync-formula-registry` without a valid session token + role MUST receive `HTTP 401/403`.

### Tasks

- [ ] **Task 1: Establish Semantic Design System (`DESIGN.md`) & Stitch Visual Prototypes**
  - **Tools / Skills:** `design-md`, `better-colors`, `better-typography`, `better-layout`, `StitchMCP` (`create_design_system_from_design_md`, `generate_screen_from_text`, `generate_variants`)
  - **Deliverables:**
    1. Create `c:\v9.1_GBF_AI_HR\DESIGN.md` defining OKLCH Astral Steel-Navy Dark & Astral Ice Light role tokens (`--surface-*`, `--text-*`, `--accent-*`, `--status-*`), typography ramp (`>=12px` minimum floor), concentric card radii (`24px` outer / `16px` inner at `8px` pad), and Myanmar Unicode `line-height: 1.65`.
    2. Generate 2 Stitch visual frames (Mobile `390px` GPS-First Home + Desktop `1280px` Sidebar Bento HUD) proving the removal of `#home-calendar-top-card`, `#hbeam`, and floating desktop nav.
  - **Exit Gate:** Present generated screens to user for visual approval BEFORE scaffolding components.

- [ ] **Task 2: Scaffold Compiled Vite + React 19 + TypeScript + `shadcn/ui` Workspace (`web/`)**
  - **Files:** `web/package.json`, `web/vite.config.ts`, `web/src/styles/tokens.css`, `web/src/components/ui/*`
  - **Steps:**
    1. Initialize React + Vite + TS + Tailwind v4 + `shadcn/ui` (`Button`, `Dialog`, `Sheet`, `Tabs`, `Calendar`, `Badge`, `Card`, `Select`, `Skeleton`), `lucide-react`, `date-fns`, `recharts`, `motion`, `@tanstack/react-query`, `vite-plugin-pwa`.
    2. Configure `Vitest` + `@testing-library/react` and assert zero missing accessible names / CSS token build.
    3. Verify clean production build (`npm run build`) with `0` TypeScript errors and zero external runtime CDN dependencies for CSS/Icons.

- [ ] **Task 3: Port Pure Domain Logic (`date-yangon.ts`, `kpi-engine.ts`) with TDD**
  - **Files:** `web/src/lib/date-yangon.ts`, `web/src/lib/kpi-engine.ts`, `web/src/__tests__/kpi-engine.test.ts`
  - **Steps:**
    1. Write failing Vitest cases porting ALL `smoke.test.mjs` Test 4 Cases A–E (`WORKING_DAYS_YYYY_MM`, Win Rate with AFK, Op vs Non-Op Team Spirit, `3+ AFK` forfeiture, `"Ko Myo"` vs `"Ko Myo Thant Zaw"`, Yangon `23:30` date boundary, `2026-01-31` monthly step).
    2. Run `npx vitest run` -> verify FAIL.
    3. Implement typed pure functions in `date-yangon.ts` and `kpi-engine.ts`.
    4. Run `npx vitest run` -> verify PASS (`100%` parity with `src/PayrollEngine.gs`).

- [ ] **Task 4: Build Responsive App Shell & Streamlined GPS-First Home (`AppShell.tsx`, `home/*`)**
  - **Files:** `web/src/components/layout/AppShell.tsx`, `web/src/components/home/GpsArenaCard.tsx`, `MasteryHudCard.tsx`, `RosterCard.tsx`, `BattleSquadsCard.tsx`
  - **Steps:**
    1. Implement Skip Link (`Skip to main content`), semantic `<header>` `<nav>` `<main>`, desktop sidebar (`>=1024px`), mobile safe-area bottom nav (`<1024px`).
    2. Build `GpsArenaCard` at top of Home with 1 compact `Today Squad / Past Days ▸` chip (no bulky top calendar card).
    3. Build `MasteryHudCard` with 3 Telemetry Rings, 4-Chip Micro-Strip, and accessible SVG/Recharts 5-Axis Radar (`prefers-reduced-motion` compliant, zero `7.5px–9px` tiny fonts).
    4. Run component unit tests + Vite build.

- [ ] **Task 5: Build Unified History Calendar (`React DayPicker`) + Wallet/Forms/Admin Views**
  - **Files:** `web/src/components/history/HistoryView.tsx`, `web/src/components/wallet/WalletView.tsx`, `web/src/components/forms/QuickActionModals.tsx`, `web/src/components/admin/AdminConsole.tsx`
  - **Steps:**
    1. Implement `HistoryView.tsx` using `React DayPicker` (`timeZone="Asia/Yangon"`) displaying BOTH Personal Attendance (`IN -> OUT`, KPI badge) AND Assigned Battle Squad + Roster for any clicked date.
    2. Wire Wallet/Payslip (`100%` dynamic working days), native `<dialog>`/Radix forms (`>=16px` inputs, inline Zod errors), and Admin AI/Payroll/Formula Registry controls.
    3. Run Playwright E2E checks across `320px`, `375px`, `412px`, `1280px` in Dark & Light modes (`0` console errors, `0` horizontal overflow, WCAG AA contrast pass).

- [ ] **Task 6 *(Option B2 Only)*: Provision `mcp-server-neon` PostgreSQL Schema, Netlify Functions + JWT Auth & Async Sheets Sync**
  - **Tools / Files:** `mcp-server-neon` (`create_project` / `prepare_database_migration` / `complete_database_migration`), `db/migrations/001_initial_schema.sql`, `netlify/functions/*`, `src/TelegramBot.gs` webhook bridge update
  - **Steps:**
    1. Create normalized Postgres tables matching all `11` entities in `Config.gs:GBF_DB_SCHEMA` with PK/FK constraints, `(official_emp_id, work_date)` unique attendance index, `idempotency_key` unique table, and hashed PIN + HMAC/JWT session auth.
    2. Build Zod-validated Netlify Functions (`/api/auth/login`, `/api/attendance/checkin`, `/api/dashboard`, `/api/payroll/generate`, `/api/settings/formulas`) enforcing RBAC on every request (`401`/`403` tests in Vitest).
    3. Add idempotent async webhook/cron mirror pushing finalized `Daily_Attendance`, `Payroll_Prep_Ledger`, and `KPI_Formula_Registry` snapshots back to Google Sheet `1J13zp0CF3Pogq3ijRMWPl0fJNFliNjzzHsXUU_6VEyw` so Finance workflows stay uninterrupted.
    4. Update Telegram Bot Mini App URL to Netlify HTTPS domain (native WebApp without GAS iframe!).

- [ ] **Task 7: Final End-to-End Verification, `cto-challenger` Audit & Documentation Sync**
  - Run full `Vitest` + `Playwright` + `smoke.test.mjs` + `chrome-devtools` live QA (`0` console errors, Light & Dark contrast verified, secret scan clean).
  - Run read-only `cto-challenger` final audit before production cutover.

---

## Key Decisions Needed From User Before Starting

1. **Calendar Cut Confirmation:** Confirm removing `#home-calendar-top-card` (`Index.html:L1052`), `#hbeam-0..2` (`L1042`), and bottom Calendar card (`L1401`) from Home, keeping only a slim 1-line `[Today • Squad • Past Days ▸]` pill and moving deep date/squad exploration into the dedicated `History` view?
2. **Delivery Scope:** Pick **`Option B2`** (Full Pro Stack: `StitchMCP` + `React/Vite/shadcn` + `Neon Postgres` + Netlify + Real Session Auth + Sheets Sync — **CTO Recommended**), **`Option B1`** (Pro UI `StitchMCP` + `React/Vite/shadcn` on Netlify connected to existing GAS backend first), or **`Option A`** (Minimal cleanup inside current `Index.html`)?
