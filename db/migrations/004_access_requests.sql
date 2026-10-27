-- Access requests: someone asks for an account and chooses their password; only the PI can approve or reject.
-- The password is kept (hashed) only while the request is pending; it is cleared once the request is decided or expires.
create table access_requests (
  id              uuid primary key default gen_random_uuid(),
  email           text not null,
  display_name    text not null,
  requested_role  text not null check (requested_role in ('pi', 'research_officer', 'phlebotomist', 'pk_scientist', 'data_manager')),
  note            text not null default '',
  password_hash   text,
  status          text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'expired')),
  created_at      timestamptz not null default now(),
  expires_at      timestamptz not null default now() + interval '14 days',
  decided_by      uuid references app_users (id),
  decided_at      timestamptz,
  decision_role   text,
  decision_reason text,
  user_id         uuid references app_users (id)
);

-- One open request per email address.
create unique index access_requests_one_pending on access_requests (lower(email)) where status = 'pending';
create index access_requests_status_idx on access_requests (status, created_at desc);

create trigger audit_access_requests after insert or update or delete on access_requests
  for each row execute function audit_capture('id');

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'smarttb_app') then
    grant select, insert, update on access_requests to smarttb_app;
  end if;
end
$$;
