# FloCRM — Deployment Guide

## What you get
A full multi-user sales CRM with:
- Role-based access (Admin, AM, BDO, Trading Analyst)
- Lead management, pipeline board, CSV upload
- Weighted/round-robin auto distribution
- Automated commission calculations for all roles
- Trading analyst commission entry & approval workflow
- Admin portal for all settings

---

## Step 1 — Supabase setup (10 min)

1. Go to https://supabase.com and click **Start your project**
2. Create a new project (pick any name, e.g. `flocrm`). Choose a strong DB password.
3. Wait ~2 minutes for the project to spin up.
4. Go to **SQL Editor** in the left sidebar.
5. Click **+ New query**, paste the entire contents of `supabase/migrations/001_schema.sql`, and click **Run**.
   - This creates all your tables, security policies, and seed data.

6. Go to **Project Settings → API** and copy:
   - `Project URL` → this is your `NEXT_PUBLIC_SUPABASE_URL`
   - `anon / public` key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` key (scroll down) → `SUPABASE_SERVICE_ROLE_KEY`

---

## Step 2 — Create your first Admin account (2 min)

1. In Supabase, go to **Authentication → Users → Add user**
2. Enter your admin email and a password. Click **Create user**.
3. Copy the User UUID shown (e.g. `a1b2c3d4-...`)
4. Go to **SQL Editor**, run this (replace the values):

```sql
INSERT INTO profiles (id, name, role, is_active)
VALUES ('YOUR-UUID-HERE', 'Your Name', 'admin', true);
```

---

## Step 3 — Deploy to Vercel (5 min)

### Option A — GitHub (recommended)
1. Push this folder to a GitHub repo:
   ```bash
   cd flocrm
   git init
   git add .
   git commit -m "initial"
   # create a repo on github.com then:
   git remote add origin https://github.com/YOUR_USERNAME/flocrm.git
   git push -u origin main
   ```
2. Go to https://vercel.com → **Add New Project** → Import your repo
3. Vercel auto-detects Next.js. Before deploying, click **Environment Variables** and add:
   ```
   NEXT_PUBLIC_SUPABASE_URL      = (your project URL)
   NEXT_PUBLIC_SUPABASE_ANON_KEY = (your anon key)
   SUPABASE_SERVICE_ROLE_KEY     = (your service role key)
   ```
4. Click **Deploy**. In ~2 minutes you'll get a live URL like `flocrm.vercel.app`.

### Option B — Vercel CLI
```bash
npm install -g vercel
cd flocrm
vercel
# follow prompts, then add env vars via vercel dashboard
```

---

## Step 4 — Add your team (2 min per person)

1. Log in to your live CRM as admin
2. Go to **Team → Add Member**
3. Enter name, email, password, role, and (for BDOs) which AM they report to
4. Share the credentials with your team member — they log in at your Vercel URL

---

## Role capabilities

| Feature | Admin | AM | BDO | Analyst |
|---|---|---|---|---|
| Dashboard | ✓ | ✓ | ✓ | ✓ |
| All leads | ✓ | Team only | Own only | Assigned only |
| Add leads | ✓ | ✓ | ✓ | — |
| Pipeline | ✓ | ✓ | ✓ | — |
| Commission view | ✓ | ✓ | Own | — |
| My Clients | — | — | — | ✓ |
| Team management | ✓ | View | — | — |
| Admin panel | ✓ | — | — | — |
| Commission settings | ✓ | — | — | — |
| Lead distribution | ✓ | — | — | — |
| Trading comm entry | ✓ | — | — | — |

---

## Local development

```bash
cd flocrm
cp .env.local.example .env.local
# fill in your Supabase keys in .env.local
npm install
npm run dev
# open http://localhost:3000
```

---

## Commission logic (built-in)

**BDO:**
- Per-account bonus: PKR 500/account if accounts > 30 (configurable)
- Deposit commission: 0.5% if cumulative deposits ≥ PKR 2.2M (configurable)
- AM-handled share: 0.5% on deposits of clients moved to AM (configurable)
- All thresholds and rates editable from Admin → Commission Settings

**AM:**
- Target: 4 high-value clients (≥1M) per subordinate BDO (configurable)
- Commission: 0.5% on all qualifying AM-handled deposits
- Performance bonus tiers based on target achievement %

**Trading Analyst:**
- Commission based on brokerage/trading commission generated (not deposits)
- Base payout rate: 10% of total commission generated (configurable)
- Performance tiers: higher rates for higher commission months
- Monthly entry by admin, with approval workflow

---

## CSV Lead Upload format

```csv
client_name,phone,email,city,notes,bdo_name,stage,deposit_amount,deposit_date
Ahmed Malik,0300-1234567,ahmed@mail.com,Lahore,Referred,Ali Raza,new,,
Sara Qureshi,0321-9876543,,Karachi,,Fatima N.,contacted,500000,2025-04-10
```

Columns `bdo_name`, `stage`, `deposit_amount`, `deposit_date` are optional.

---

## Support & customisation
The codebase is in `src/` — all business logic is in `src/lib/commission.ts` and `src/lib/distribution.ts`.
Database schema is in `supabase/migrations/001_schema.sql`.
