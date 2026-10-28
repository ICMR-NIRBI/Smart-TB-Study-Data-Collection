-- Roles become a table, so the PI and the data manager can add their own roles and remove them again.
-- The five built-in roles are rows here too, but what they may do stays in the application code.
-- A custom role lists the CRF modules its holders may fill in; everyone can still view the study data.
-- Removing a role only hides it (deleted_at), so the audit trail keeps its name.
create table roles (
  key         text primary key,
  label       text not null check (length(label) between 2 and 40),
  description text not null default '' check (length(description) <= 140),
  builtin     boolean not null default false,
  modules     integer[] not null default '{}' check (modules <@ array[1, 2, 3, 4, 5, 6, 7, 8, 9, 10]),
  created_by  uuid references app_users (id),
  created_at  timestamptz not null default now(),
  deleted_at  timestamptz,
  deleted_by  uuid references app_users (id)
);

-- A name can be used by one live role at a time (case does not matter).
create unique index roles_label_live on roles (lower(label)) where deleted_at is null;

insert into roles (key, label, builtin) values
  ('pi', 'Principal Investigator', true),
  ('research_officer', 'Research Officer', true),
  ('phlebotomist', 'Phlebotomist', true),
  ('pk_scientist', 'PK Scientist', true),
  ('data_manager', 'Data Manager', true);

alter table app_users drop constraint app_users_role_check;
alter table app_users add constraint app_users_role_fkey foreign key (role) references roles (key);
alter table access_requests drop constraint access_requests_requested_role_check;

create trigger audit_roles after insert or update or delete on roles
  for each row execute function audit_capture('key');

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'smarttb_app') then
    grant select, insert, update on roles to smarttb_app;
  end if;
end
$$;
