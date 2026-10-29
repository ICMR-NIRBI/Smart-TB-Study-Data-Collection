-- The PI and the data manager can delete a staff account that nothing in the study refers to.
-- The database still refuses when the account has entered data or made changes, so the audit trail stays whole.
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'smarttb_app') then
    grant delete on app_users to smarttb_app;
  end if;
end
$$;
