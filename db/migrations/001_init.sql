-- SMART-TB CRF: initial schema.
-- Runs as the schema owner. The web app connects as the restricted role `smarttb_app` (see grants at the end).

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Staff accounts
-- ---------------------------------------------------------------------------

create table app_users (
  id            uuid primary key default gen_random_uuid(),
  email         text not null unique check (email = lower(email)),
  display_name  text not null,
  role          text not null check (role in ('pi', 'research_officer', 'phlebotomist', 'pk_scientist')),
  is_admin      boolean not null default false,
  -- Local stand-in for sign-in. Replaced by `external_uid` (Google Identity Platform) in the cloud setup.
  password_hash text,
  external_uid  text unique,
  active        boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Extra modules a person may enter or sign beyond their role (the delegation log).
create table module_delegations (
  user_id    uuid not null references app_users (id) on delete cascade,
  module_id  smallint not null check (module_id between 1 and 10),
  granted_by uuid references app_users (id),
  granted_at timestamptz not null default now(),
  primary key (user_id, module_id)
);

create table sessions (
  token_hash     text primary key,
  user_id        uuid not null references app_users (id) on delete cascade,
  created_at     timestamptz not null default now(),
  last_active_at timestamptz not null default now(),
  user_agent     text
);
create index sessions_user_idx on sessions (user_id);

create table login_attempts (
  email        text primary key,
  fails        integer not null default 0,
  locked_until timestamptz
);

-- ---------------------------------------------------------------------------
-- Study data
-- ---------------------------------------------------------------------------

create table participants (
  uid                       text primary key,
  discontinuation_requested boolean not null default false,
  created_at                timestamptz not null default now(),
  created_by                uuid references app_users (id),
  updated_at                timestamptz not null default now()
);

-- One row per participant per CRF module. Module fields live in `data`; phone and address never do.
create table crf_modules (
  participant_uid   text not null references participants (uid) on delete restrict,
  module_id         smallint not null check (module_id between 1 and 10),
  data              jsonb not null default '{}'::jsonb,
  completed         boolean not null default false,
  completed_by      uuid references app_users (id),
  completed_by_name text not null default '',
  completed_role    text not null default '',
  completed_at      timestamptz,
  editing           boolean not null default false,
  draft_saved_at    timestamptz,
  updated_at        timestamptz not null default now(),
  updated_by        uuid references app_users (id),
  primary key (participant_uid, module_id),
  check (not (data ? 'phone') and not (data ? 'address'))
);

-- Study IDs must be unique once entered.
create unique index crf_modules_participant_id_key
  on crf_modules ((data ->> 'participantId'))
  where module_id = 1 and coalesce(data ->> 'participantId', '') <> '';

-- Reasons given when a completed module is reopened. Append-only.
create table module_edit_reasons (
  id              bigserial primary key,
  participant_uid text not null references participants (uid) on delete restrict,
  module_id       smallint not null check (module_id between 1 and 10),
  at              timestamptz not null default now(),
  user_id         uuid references app_users (id),
  by_name         text not null,
  role            text not null,
  reason          text not null check (length(trim(reason)) > 0)
);
create index module_edit_reasons_idx on module_edit_reasons (participant_uid, module_id, at);

-- Master link: participant contact details, encrypted with a key held outside the database.
create table participant_contacts (
  participant_uid text primary key references participants (uid) on delete restrict,
  phone_enc       bytea,
  address_enc     bytea,
  updated_at      timestamptz not null default now(),
  updated_by      uuid references app_users (id)
);

-- ---------------------------------------------------------------------------
-- Audit trail: written by triggers, never edited
-- ---------------------------------------------------------------------------

create table audit_log (
  id         bigserial primary key,
  at         timestamptz not null default now(),
  user_id    uuid,
  table_name text not null,
  row_key    text not null,
  action     text not null,
  changes    jsonb not null,
  reason     text
);
create index audit_log_row_idx on audit_log (table_name, row_key, at);

-- {key: {old, new}} for every top-level key that differs.
create function jsonb_changes(o jsonb, n jsonb) returns jsonb
language sql immutable as $$
  select coalesce(jsonb_object_agg(k, jsonb_build_object('old', o -> k, 'new', n -> k)), '{}'::jsonb)
  from (select jsonb_object_keys(coalesce(o, '{}'::jsonb) || coalesce(n, '{}'::jsonb)) as k) keys
  where (o -> k) is distinct from (n -> k)
$$;

-- Trigger arguments name the key columns of the audited table.
create function audit_capture() returns trigger
language plpgsql as $$
declare
  o       jsonb := case when tg_op = 'INSERT' then null else to_jsonb(old) end;
  n       jsonb := case when tg_op = 'DELETE' then null else to_jsonb(new) end;
  src     jsonb := coalesce(n, o);
  noise   text[] := array['updated_at', 'updated_by'];
  changes jsonb;
  row_key text := '';
  i       integer;
begin
  for i in 0 .. tg_nargs - 1 loop
    row_key := row_key || case when i > 0 then ':' else '' end || coalesce(src ->> tg_argv[i], '');
  end loop;

  -- Never copy password hashes into the log; note only that one changed.
  if (o -> 'password_hash') is distinct from (n -> 'password_hash') then
    o := o - 'password_hash';
    n := n - 'password_hash' || jsonb_build_object('password_changed', true);
  else
    o := o - 'password_hash';
    n := n - 'password_hash';
  end if;

  changes := jsonb_changes(o - noise - 'data', n - noise - 'data');
  if (o -> 'data') is distinct from (n -> 'data') then
    changes := changes || coalesce(
      (select jsonb_object_agg('data.' || key, value) from jsonb_each(jsonb_changes(o -> 'data', n -> 'data'))),
      '{}'::jsonb);
  end if;

  if changes <> '{}'::jsonb then
    insert into audit_log (user_id, table_name, row_key, action, changes, reason)
    values (
      nullif(current_setting('app.user_id', true), '')::uuid,
      tg_table_name,
      row_key,
      tg_op,
      changes,
      nullif(current_setting('app.reason', true), '')
    );
  end if;
  return null;
end
$$;

create trigger audit_app_users after insert or update or delete on app_users
  for each row execute function audit_capture('id');
create trigger audit_module_delegations after insert or update or delete on module_delegations
  for each row execute function audit_capture('user_id', 'module_id');
create trigger audit_participants after insert or update or delete on participants
  for each row execute function audit_capture('uid');
create trigger audit_crf_modules after insert or update or delete on crf_modules
  for each row execute function audit_capture('participant_uid', 'module_id');
create trigger audit_participant_contacts after insert or update or delete on participant_contacts
  for each row execute function audit_capture('participant_uid');

create function reject_change() returns trigger
language plpgsql as $$
begin
  raise exception '% is append-only', tg_table_name;
end
$$;

create trigger audit_log_append_only before update or delete on audit_log
  for each row execute function reject_change();
create trigger audit_log_no_truncate before truncate on audit_log
  for each statement execute function reject_change();
create trigger edit_reasons_append_only before update or delete on module_edit_reasons
  for each row execute function reject_change();

-- ---------------------------------------------------------------------------
-- Runtime permissions: the app can read and write study data but never delete it
-- ---------------------------------------------------------------------------

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'smarttb_app') then
    revoke all on all tables in schema public from smarttb_app;
    grant usage on schema public to smarttb_app;
    grant select, insert, update on app_users, module_delegations, participants, crf_modules, participant_contacts
      to smarttb_app;
    grant select, insert on module_edit_reasons, audit_log to smarttb_app;
    grant select, insert, update, delete on sessions, login_attempts to smarttb_app;
    grant delete on module_delegations to smarttb_app;
    grant usage on all sequences in schema public to smarttb_app;
  end if;
end
$$;
