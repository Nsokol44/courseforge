# CourseForge AI

AI-powered course design platform for professors. Upload materials, generate courses, export to Canvas.

**Stack:** Next.js 14 · Supabase · Anthropic Claude · Bulma CSS

---

## Quick Start

### 1. Clone & install

```bash
git clone <your-repo>
cd courseforge
npm install
```

### 2. Set up Supabase

1. Go to [supabase.com](https://supabase.com) and create a new project
2. In your project dashboard, go to **SQL Editor**
3. Copy and run the entire contents of `supabase/migrations/001_initial_schema.sql`
4. Go to **Settings → API** and copy your:
   - Project URL (`https://xxxx.supabase.co`)
   - `anon` public key

### 3. Get your Anthropic API key

1. Go to [console.anthropic.com](https://console.anthropic.com)
2. Sign up or log in
3. Click **API Keys → + Create Key**
4. Copy the key immediately (shown once only)
5. Go to **Billing → Buy Credits** — add at least $5 to activate

### 4. Configure environment

```bash
cp .env.local.example .env.local
```

Edit `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
ANTHROPIC_API_KEY=sk-ant-api03-your-key-here
```

> ⚠️ **Never commit `.env.local` to git.** It's already in `.gitignore`.

### 5. Run

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

---

## Project Structure

```
courseforge/
├── app/
│   ├── api/
│   │   ├── analyze/route.ts      # POST: AI style profile from uploaded files
│   │   ├── ask/route.ts          # POST: course AI assistant
│   │   └── generate/route.ts     # POST: full course generation
│   ├── auth/page.tsx             # Sign in / sign up
│   ├── dashboard/
│   │   ├── layout.tsx            # Sidebar + auth guard
│   │   ├── page.tsx              # Redirects to first course
│   │   ├── courses/
│   │   │   ├── [id]/page.tsx     # Course view (schedule, assignments, analysis, etc.)
│   │   │   └── new/page.tsx      # Upload wizard
│   │   ├── generate/page.tsx     # Generate new course
│   │   └── export/               # Canvas .imscc export
│   ├── globals.css               # Bulma + CourseForge design tokens
│   └── layout.tsx                # Root layout + toast
├── components/
│   ├── ai/AIBanner.tsx           # AI ask bar with quick prompts
│   ├── course/
│   │   ├── CourseView.tsx        # Full course dashboard (tabs)
│   │   ├── UploadWizard.tsx      # 3-step course creation
│   │   └── GenerateCourse.tsx    # Course generation form
│   ├── layout/Sidebar.tsx        # Navigation sidebar
│   └── ui/EmptyState.tsx
├── lib/
│   ├── ai.ts                     # Anthropic client, prompts, parser
│   └── supabase.ts               # Browser + server Supabase clients
├── types/index.ts                # All TypeScript types
└── supabase/migrations/
    └── 001_initial_schema.sql    # Full DB schema with RLS
```

---

## How It Works

### Security model
- **API key never touches the browser.** All Claude calls go through Next.js API routes (`/api/ask`, `/api/generate`, `/api/analyze`). The `ANTHROPIC_API_KEY` env var is only available server-side.
- **Row Level Security (RLS)** is enabled on every Supabase table. Professors can only read and write their own data.
- **Auth** is handled by Supabase Auth (email/password).

### Data flow
1. Professor uploads files → client reads text → `POST /api/analyze` → Claude infers style profile → saved to `courses.style_profile`
2. Professor asks AI → `POST /api/ask` with course context → Claude responds → response is parsed for structured data (weeks, Bloom's, Python, etc.) → saved to Supabase
3. Generate course → `POST /api/generate` → Claude generates full course → parsed and saved to Supabase tables → redirects to new course view

---

## Deployment

### Vercel (recommended)

```bash
npm install -g vercel
vercel
```

Add your three environment variables in the Vercel dashboard under **Settings → Environment Variables**.

### Environment variables needed in production

| Variable | Where to get it |
|----------|----------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → Settings → API |
| `ANTHROPIC_API_KEY` | console.anthropic.com → API Keys |

---

## Canvas Export

The Export page generates a valid **IMS Common Cartridge 1.1** (`.imscc`) file. To import into Canvas:

1. Go to your Canvas course → **Settings**
2. Click **Import Course Content**
3. Select **Canvas Common Cartridge 1.x Package**
4. Upload the `.imscc` file
5. Choose what to import and click **Import**
