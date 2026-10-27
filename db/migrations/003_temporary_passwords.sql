-- Temporary passwords: an administrator can give someone a one-time starting password. Until they choose their own,
-- they can do nothing in the app except change it.
alter table app_users add column must_change_password boolean not null default false;
