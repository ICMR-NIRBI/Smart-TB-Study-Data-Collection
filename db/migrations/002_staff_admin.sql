-- Staff administration: data manager role, one-time account setup links, delegation reasons and end dates.

alter table app_users drop constraint app_users_role_check;
alter table app_users add constraint app_users_role_check
  check (role in ('pi', 'research_officer', 'phlebotomist', 'pk_scientist', 'data_manager'));
alter table app_users add column last_sign_in_at timestamptz;
alter table app_users add column updated_by uuid references app_users (id);

alter table module_delegations add column reason text not null default '';
alter table module_delegations add column expires_at date;

-- One-time links for setting or resetting a password. Only the token's hash is stored.
create table account_setup_tokens (
  token_hash text primary key,
  user_id    uuid not null references app_users (id) on delete cascade,
  created_by uuid references app_users (id),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at    timestamptz
);
create index account_setup_tokens_user_idx on account_setup_tokens (user_id);

-- Sign-in time changes on every login; it is not an account change worth auditing.
create or replace function audit_capture() returns trigger
language plpgsql as $$
declare
  o       jsonb := case when tg_op = 'INSERT' then null else to_jsonb(old) end;
  n       jsonb := case when tg_op = 'DELETE' then null else to_jsonb(new) end;
  src     jsonb := coalesce(n, o);
  noise   text[] := array['updated_at', 'updated_by', 'last_sign_in_at'];
  changes jsonb;
  row_key text := '';
  i       integer;
begin
  for i in 0 .. tg_nargs - 1 loop
    row_key := row_key || case when i > 0 then ':' else '' end || coalesce(src ->> tg_argv[i], '');
  end loop;

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

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'smarttb_app') then
    grant select, insert, update on account_setup_tokens to smarttb_app;
  end if;
end
$$;
