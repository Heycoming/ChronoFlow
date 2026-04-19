<div align="center">

<img src="public/logo.svg" alt="ChronoFlow Logo" width="80" />

# ChronoFlow

**AI-powered dynamic scheduling that adapts to your energy and time.**

[![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=next.js)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-blue?logo=typescript)](https://www.typescriptlang.org/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-4-38bdf8?logo=tailwindcss)](https://tailwindcss.com/)
[![Prisma](https://img.shields.io/badge/Prisma-7-2D3748?logo=prisma)](https://www.prisma.io/)
[![Gemini](https://img.shields.io/badge/Gemini_AI-powered-4285F4?logo=google)](https://ai.google.dev/)
[![Deployed on Vercel](https://img.shields.io/badge/Deployed_on-Vercel-black?logo=vercel)](https://chronoflow-tau.vercel.app)

[Live Demo](https://chronoflow-tau.vercel.app) · [Report Bug](https://github.com/Heycoming/ChronoFlow/issues)

</div>

---

## Overview

ChronoFlow is an AI-powered calendar and task management application that intelligently schedules your tasks based on energy levels, priorities, deadlines, and personal routines. Unlike traditional schedulers, ChronoFlow specializes in **fragmented-time utilization** — finding and filling small gaps in your day that other tools ignore.

## Key Features

- **AI Schedule Generation** — Gemini AI analyzes your tasks, constraints, and energy patterns to generate an optimized weekly schedule
- **Reality Check** — Mathematically validates whether your task load is feasible before invoking the AI, preventing impossible schedules
- **Real-Time Check-Ins** — Report task progress (on time, early, late, skipped) and trigger automatic 48-hour partial reflows
- **Diff View Approvals** — Review every AI-proposed change in a GitHub-style diff view (green = added, red = removed, yellow = shifted) before committing
- **Google Calendar Sync** — Import existing events (read-only) so the AI plans around your real commitments
- **Smart Buffering** — Automatic 10–15 min cognitive buffers between high-energy blocks
- **Constraint-Aware** — Respects sleep schedules, meals, hygiene routines, and custom recurring commitments
- **Energy-Based Scheduling** — Matches tasks to optimal time slots based on energy type (High Focus, Low Energy, Creative, Admin)
- **Interactive 3D Landing Page** — Spatial visualization of task cards with mouse-driven parallax, zoom, and hover focus

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16 (App Router) |
| Language | TypeScript 5 |
| Styling | Tailwind CSS v4 |
| Database | PostgreSQL on Neon (serverless) |
| ORM | Prisma 7 |
| Auth | Auth.js v5 (Google OAuth) |
| AI Engine | Google Gemini via `@google/genai` |
| State | Zustand |
| Validation | Zod |
| Calendar | Custom horizontal timeline grid |
| Testing | Vitest (unit), Playwright (E2E) |
| Deployment | Vercel |

---

## Access Restrictions

> **Important:** This application restricts sign-in to the following:
> - **`@umich.edu`** email addresses
> - Explicitly allowed email addresses (configured server-side)
>
> Other Google accounts will be denied at sign-in.

> **API Rate Limit:** Each user is limited to **10 AI generation calls per day** (schedule generation + reflows). This limit resets daily at midnight UTC.

## Privacy & Google Verification

> **Google Calendar Access:** ChronoFlow requests **read-only** access (`calendar.readonly`) to your Google Calendar. Your calendar data is used solely to display existing events and to help the AI schedule around them. **ChronoFlow never creates, modifies, or deletes any events on your Google Calendar.**
>
> **Data Usage:** Your calendar data and task information are stored in your private account and are not shared with any third parties.
>
> **Google Verification Notice:** This application has not yet completed Google's OAuth verification process. When signing in for the first time, you may see a warning screen stating "Google hasn't verified this app." To proceed, click **"Advanced"** → **"Go to chronoflow (unsafe)"**. This is a standard notice for apps pending verification and does not indicate any security issue.

---

## Getting Started

### Prerequisites

- **Node.js** 18+ ([download](https://nodejs.org/))
- **pnpm** (required — not npm or yarn)
  ```bash
  npm install -g pnpm
  ```
- **PostgreSQL** database — we recommend [Neon](https://neon.tech/) (free tier available)

### 1. Clone the Repository

```bash
git clone https://github.com/Heycoming/ChronoFlow.git
cd ChronoFlow
```

### 2. Install Dependencies

```bash
pnpm install
```

### 3. Set Up Environment Variables

Copy the example file and fill in your values:

```bash
cp .env.example .env.local
```

Edit `.env.local` with the following:

```env
# Neon PostgreSQL — direct (unpooled) connection string
DATABASE_URL="postgresql://user:password@ep-xyz.region.aws.neon.tech/chronoflow?sslmode=require"

# Google OAuth — from Google Cloud Console → APIs & Services → Credentials
GOOGLE_CLIENT_ID="your-client-id.apps.googleusercontent.com"
GOOGLE_CLIENT_SECRET="your-client-secret"

# Gemini AI — from Google AI Studio (https://aistudio.google.com/)
GEMINI_API_KEY="your-gemini-api-key"

# Auth.js secret — generate with: openssl rand -base64 32
NEXTAUTH_SECRET="your-generated-secret"

# App URL
NEXTAUTH_URL="http://localhost:3000"

# (Optional) Comma-separated list of non-umich emails allowed to sign in
ALLOWED_EMAILS="your-email@gmail.com"

# (Optional) Max AI generation calls per user per day (default: 10)
RATE_LIMIT_PER_DAY=10
```

#### How to Get API Keys

| Key | Where to Get It |
|-----|----------------|
| `DATABASE_URL` | [Neon Console](https://console.neon.tech/) → Create project → Connection string |
| `GOOGLE_CLIENT_ID` / `SECRET` | [Google Cloud Console](https://console.cloud.google.com/) → APIs & Services → Credentials → Create OAuth 2.0 Client ID (Web application). Add `http://localhost:3000/api/auth/callback/google` as an authorized redirect URI. |
| `GEMINI_API_KEY` | [Google AI Studio](https://aistudio.google.com/) → Get API Key |
| `NEXTAUTH_SECRET` | Run `openssl rand -base64 32` in your terminal |

### 4. Set Up the Database

Run Prisma migrations to create the database schema:

```bash
pnpm db:migrate
```

### 5. Start the Development Server

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## Available Commands

| Command | Description |
|---------|-------------|
| `pnpm dev` | Start development server (Turbopack) |
| `pnpm build` | Production build |
| `pnpm start` | Start production server |
| `pnpm lint` | Run ESLint |
| `pnpm test` | Run unit tests (Vitest) |
| `pnpm test:watch` | Run unit tests in watch mode |
| `pnpm test:e2e` | Run E2E tests (Playwright) |
| `pnpm db:migrate` | Run database migrations |
| `pnpm db:studio` | Open Prisma Studio (DB browser) |

---

## Project Structure

```
src/
├── app/
│   ├── (app)/              # Authenticated route group
│   │   ├── calendar/       # Weekly timeline calendar view
│   │   ├── tasks/          # Task management (CRUD)
│   │   ├── onboarding/     # New user constraint setup
│   │   └── review/         # Nightly review dashboard
│   ├── api/                # API route handlers
│   │   ├── schedule/       # generate, approve, reject, reflow
│   │   ├── checkin/        # Task check-in endpoint
│   │   └── gcal/           # Google Calendar sync
│   ├── signin/             # Sign-in page
│   └── page.tsx            # Landing page (3D spatial hero)
├── components/             # React components
│   ├── CalendarGrid.tsx    # Horizontal timeline calendar
│   ├── DiffView.tsx        # GitHub-style schedule diff
│   ├── CheckInModal.tsx    # Task check-in modal
│   ├── LandingHero.tsx     # 3D landing page scene
│   └── ...
├── lib/
│   ├── gemini/             # AI generation (schema, prompts, client)
│   ├── gcal/               # Google Calendar integration
│   ├── realityCheck.ts     # Mathematical feasibility check (pure)
│   ├── diff.ts             # Schedule diff computation (pure)
│   └── rateLimit.ts        # Per-user daily rate limiting
├── store/
│   └── scheduleStore.ts    # Zustand state management
└── types/
    └── schedule.ts         # Shared TypeScript types
```

---

## Deployment

The app is deployed on [Vercel](https://vercel.com). To deploy your own instance:

1. Push the repository to GitHub
2. Import the repo on [Vercel](https://vercel.com/new)
3. Set **Install Command** to `pnpm install`
4. Add all environment variables from `.env.example`
5. Set `NEXTAUTH_URL` to your Vercel domain (e.g., `https://your-app.vercel.app`)
6. Add `https://your-app.vercel.app/api/auth/callback/google` as an authorized redirect URI in Google Cloud Console
7. Deploy

---

## License

This project was built as a final project for SI511 at the University of Michigan.

Built and vibe-coded entirely through human vision + [Claude Code](https://claude.ai/code) implementation — all product decisions, design direction, and feature ideas are human-driven, while technical implementation details were realized with AI-assisted coding.
