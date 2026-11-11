-- First create a confirmed email/password user in Authentication > Users > Add user.
-- Replace ONLY the email below, then run this in the SQL editor as project owner.
-- Never let browser users insert their own administrator allowlist entry.
do $$
declare teacher_email text := 'REPLACE_WITH_YOUR_TEACHER_EMAIL'; teacher_id uuid;
begin
  select id into teacher_id from auth.users where lower(email)=lower(teacher_email) and coalesce(is_anonymous,false)=false;
  if teacher_id is null then raise exception 'Create the teacher in Authentication > Users first and set the matching email in this script'; end if;
  insert into levelup_private.administrators(user_id) values(teacher_id) on conflict do nothing;
  raise notice 'Teacher access granted';
end $$;
-- To revoke a teacher immediately, delete their row from levelup_private.administrators.
