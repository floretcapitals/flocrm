-- VertexCRM Full Schema
-- Run this in Supabase SQL Editor

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- ─── PROFILES ────────────────────────────────────────────────────────────────
create table profiles (
  id uuid references auth.users on delete cascade primary key,
  name text not null,
  role text not null check (role in ('admin','am','bdo','trading')),
  reports_to uuid references profiles(id) on delete set null,
  is_active boolean default true,
  created_at timestamptz default now()
);
alter table profiles enable row level security;

-- Admins can see all profiles; others see their own + their team
create policy "Profiles: admin full access" on profiles
  for all using (
    exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin')
  );
create policy "Profiles: self read" on profiles
  for select using (id = auth.uid());
create policy "Profiles: read team" on profiles
  for select using (
    reports_to = auth.uid() or
    id in (select reports_to from profiles where id = auth.uid())
  );

-- ─── COMMISSION SETTINGS ─────────────────────────────────────────────────────
create table commission_settings (
  id uuid default uuid_generate_v4() primary key,
  -- BDO
  bdo_acct_min_threshold int default 30,
  bdo_acct_bonus_per_account int default 500,
  bdo_dep_threshold bigint default 2200000,
  bdo_dep_commission_pct numeric default 0.5,
  bdo_am_share_pct numeric default 0.5,
  bdo_cycle text default 'monthly',
  -- AM
  am_target_per_bdo int default 4,
  am_min_dep_qualify bigint default 1000000,
  am_dep_commission_pct numeric default 0.5,
  am_escalate_threshold bigint default 1000000,
  am_cycle text default 'monthly',
  -- Trading Analyst
  ta_payout_pct numeric default 10,
  ta_min_comm_qualify bigint default 0,
  ta_max_clients int default 10,
  ta_cycle text default 'monthly',
  ta_approval_required boolean default true,
  -- Global
  currency text default 'PKR',
  commission_approval boolean default true,
  carry_forward boolean default false,
  updated_at timestamptz default now(),
  updated_by uuid references profiles(id)
);
insert into commission_settings default values;

-- BDO deposit tiers
create table commission_bdo_tiers (
  id uuid default uuid_generate_v4() primary key,
  from_amount bigint not null default 0,
  to_amount bigint,
  commission_pct numeric not null default 0,
  sort_order int default 0
);
insert into commission_bdo_tiers (from_amount, to_amount, commission_pct, sort_order) values
  (0, 2199999, 0, 0),
  (2200000, null, 0.5, 1);

-- AM performance bonus tiers
create table commission_am_tiers (
  id uuid default uuid_generate_v4() primary key,
  achieve_pct numeric not null,
  bonus_amount bigint not null default 0
);
insert into commission_am_tiers (achieve_pct, bonus_amount) values (100, 5000), (120, 10000);

-- TA commission performance tiers
create table commission_ta_tiers (
  id uuid default uuid_generate_v4() primary key,
  min_commission bigint not null,
  payout_pct numeric not null,
  notes text
);
insert into commission_ta_tiers (min_commission, payout_pct, notes) values
  (500000, 12, 'High performer bonus'),
  (1000000, 15, 'Top tier');

-- ─── LEADS ───────────────────────────────────────────────────────────────────
create table leads (
  id uuid default uuid_generate_v4() primary key,
  name text not null,
  phone text,
  email text,
  city text,
  notes text,
  stage text not null default 'new'
    check (stage in ('new','contacted','account_opened','am_handling','trading')),
  bdo_id uuid references profiles(id) on delete set null,
  am_id uuid references profiles(id) on delete set null,
  analyst_id uuid references profiles(id) on delete set null,
  source text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  created_by uuid references profiles(id)
);
alter table leads enable row level security;

create policy "Leads: admin full" on leads for all
  using (exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin'));
create policy "Leads: bdo sees own" on leads for select
  using (bdo_id = auth.uid());
create policy "Leads: bdo insert" on leads for insert
  with check (bdo_id = auth.uid() or
    exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin'));
create policy "Leads: bdo update own" on leads for update
  using (bdo_id = auth.uid());
create policy "Leads: am sees team" on leads for select
  using (
    am_id = auth.uid() or
    bdo_id in (select id from profiles where reports_to = auth.uid())
  );
create policy "Leads: am update" on leads for update
  using (
    am_id = auth.uid() or
    bdo_id in (select id from profiles where reports_to = auth.uid())
  );
create policy "Leads: analyst sees assigned" on leads for select
  using (analyst_id = auth.uid());

-- ─── DEPOSITS ────────────────────────────────────────────────────────────────
create table deposits (
  id uuid default uuid_generate_v4() primary key,
  lead_id uuid references leads(id) on delete cascade not null,
  amount bigint not null,
  deposit_date date not null,
  notes text,
  created_at timestamptz default now(),
  created_by uuid references profiles(id)
);
alter table deposits enable row level security;

create policy "Deposits: admin full" on deposits for all
  using (exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin'));
create policy "Deposits: read via lead" on deposits for select
  using (
    lead_id in (
      select id from leads where
        bdo_id = auth.uid() or am_id = auth.uid() or analyst_id = auth.uid() or
        bdo_id in (select id from profiles where reports_to = auth.uid())
    )
  );
create policy "Deposits: bdo/am insert" on deposits for insert
  with check (
    lead_id in (
      select id from leads where bdo_id = auth.uid() or am_id = auth.uid()
    ) or
    exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin')
  );

-- ─── TRADING COMMISSIONS ─────────────────────────────────────────────────────
create table trading_commissions (
  id uuid default uuid_generate_v4() primary key,
  lead_id uuid references leads(id) on delete cascade not null,
  analyst_id uuid references profiles(id) on delete set null,
  month text not null, -- format: YYYY-MM
  commission_generated bigint not null default 0,
  analyst_payout bigint,
  payout_rate numeric,
  approved boolean default false,
  approved_by uuid references profiles(id),
  approved_at timestamptz,
  created_at timestamptz default now()
);
alter table trading_commissions enable row level security;

create policy "TC: admin full" on trading_commissions for all
  using (exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin'));
create policy "TC: analyst read own" on trading_commissions for select
  using (analyst_id = auth.uid());

-- ─── DISTRIBUTION STATE ──────────────────────────────────────────────────────
create table distribution_config (
  id uuid default uuid_generate_v4() primary key,
  bdo_id uuid references profiles(id) on delete cascade unique,
  weight int default 1 check (weight >= 0 and weight <= 10),
  is_paused boolean default false,
  rr_pointer int default 0
);
create table distribution_state (
  id int default 1 primary key check (id = 1),
  mode text default 'roundrobin' check (mode in ('roundrobin','weighted')),
  global_pointer int default 0
);
insert into distribution_state default values;

-- ─── HELPER FUNCTION: auto-updated updated_at ────────────────────────────────
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

create trigger leads_updated_at before update on leads
  for each row execute function set_updated_at();

-- ─── INDEXES ─────────────────────────────────────────────────────────────────
create index on leads(bdo_id);
create index on leads(am_id);
create index on leads(analyst_id);
create index on leads(stage);
create index on deposits(lead_id);
create index on trading_commissions(analyst_id, month);
