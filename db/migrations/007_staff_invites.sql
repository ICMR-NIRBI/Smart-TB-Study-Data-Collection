-- An invitation names only a role. The person who opens the link types their own name, email and password,
-- and the account is created then. A link works once and expires; it can be withdrawn before it is used.
create table staff_invites (
  id          uuid primary key default gen_random_uuid(),
  token_hash  text not null unique,
  role        text not null references roles (key),
  is_admin    boolean not null default false,
  created_by  uuid not null references app_users (id),
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null,
  used_at     timestamptz,
  revoked_at  timestamptz,
  revoked_by  uuid references app_users (id),
  -- The account made from the link. Deleting that account leaves the invitation record behind.
  user_id     uuid references app_users (id) on delete set null
);

create index staff_invites_open_idx on staff_invites (expires_at) where used_at is null and revoked_at is null;

create trigger audit_staff_invites after insert or update or delete on staff_invites
  for each row execute function audit_capture('id');

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'smarttb_app') then
    grant select, insert, update on staff_invites to smarttb_app;
  end if;
end
$$;
