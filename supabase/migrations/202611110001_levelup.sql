-- Apply once in a dedicated Supabase project's SQL editor or `supabase db push`.
-- No service-role key is used by the browser. All data access is through bounded RPCs.
begin;
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
create extension if not exists pg_trgm with schema extensions;
create schema if not exists levelup_private;
revoke all on schema levelup_private from public, anon, authenticated;

create function levelup_private.clean(value text) returns text
language sql immutable set search_path = '' as $$ select regexp_replace(btrim(value), '\s+', ' ', 'g') $$;
create function levelup_private.valid_id(value text) returns boolean
language sql immutable set search_path = '' as $$ select value ~ '^([a-f0-9]{24}|[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})$' $$;

create table levelup_private.administrators (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
create table public.levelup_classes (
  id text primary key default gen_random_uuid()::text check(levelup_private.valid_id(id)),
  name text not null unique check(length(name) between 1 and 120)
);
create table public.levelup_students (
  id text primary key default gen_random_uuid()::text check(levelup_private.valid_id(id)),
  name text not null check(length(name) between 2 and 100),
  name_key text generated always as (lower(levelup_private.clean(name))) stored,
  label text not null default '' check(length(label)<=80),
  class_id text references public.levelup_classes(id),
  active boolean not null default true
);
create index levelup_students_name on public.levelup_students(name_key) where active;
create index levelup_students_similar on public.levelup_students using gin(name_key extensions.gin_trgm_ops) where active;
create unique index levelup_student_profile on public.levelup_students(name_key,coalesce(class_id,''),label) where active;
create table public.levelup_papers (
  id text primary key default gen_random_uuid()::text check(levelup_private.valid_id(id)),
  name text not null check(length(name) between 1 and 120),
  subject text not null default '' check(length(subject)<=80),
  grade text not null default '' check(length(grade)<=40),
  date date,
  max integer not null check(max between 1 and 10000),
  class_id text references public.levelup_classes(id),
  state text not null default 'draft' check(state in ('draft','published','unpublished')),
  position integer not null default 0,
  updated_at timestamptz not null default now()
);
create index levelup_paper_order on public.levelup_papers(position,id);
create table public.levelup_marks (
  student_id text not null references public.levelup_students(id),
  paper_id text not null references public.levelup_papers(id),
  value numeric check(value>=0 and scale(value)<=2 and value<='10000'::numeric),
  status text not null default 'present' check(status in ('present','absent')),
  updated_at timestamptz not null default now(),
  updated_by uuid,
  primary key(student_id,paper_id),
  check(status<>'absent' or value is null)
);
create table public.levelup_audit_logs (
  id bigint generated always as identity primary key,
  actor text not null,
  action text not null,
  entity text not null,
  changes jsonb not null,
  created_at timestamptz not null default now()
);
create index levelup_audit_time on public.levelup_audit_logs(created_at desc);
create table levelup_private.student_codes (
  student_id text primary key references public.levelup_students(id) on delete cascade,
  hash text not null
);
create table levelup_private.student_grants (
  user_id uuid primary key references auth.users(id) on delete cascade,
  student_id text not null references public.levelup_students(id) on delete cascade,
  expires_at timestamptz not null
);
create table levelup_private.settings (
  singleton boolean primary key default true check(singleton),
  access_mode text not null default 'name' check(access_mode in ('name','code'))
);
insert into levelup_private.settings default values;
create table levelup_private.rate_limits (
  bucket text not null,
  window_start timestamptz not null,
  count integer not null,
  primary key(bucket,window_start)
);

-- RLS is a second boundary. No browser role is allowed to read/write tables directly.
alter table public.levelup_classes enable row level security;
alter table public.levelup_students enable row level security;
alter table public.levelup_papers enable row level security;
alter table public.levelup_marks enable row level security;
alter table public.levelup_audit_logs enable row level security;
revoke all on public.levelup_classes,public.levelup_students,public.levelup_papers,public.levelup_marks,public.levelup_audit_logs from anon,authenticated;
revoke all on all tables in schema levelup_private from public,anon,authenticated;

create function levelup_private.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from levelup_private.administrators where user_id=auth.uid())
    and coalesce((auth.jwt()->>'is_anonymous')::boolean,false)=false
$$;
create function levelup_private.require_admin() returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not levelup_private.is_admin() then raise exception 'Teacher access required' using errcode='42501'; end if;
  -- Serialize administrative edits: a maximum/publication edit cannot race a marks batch.
  perform pg_advisory_xact_lock(782945631);
end $$;
create function levelup_private.throttle(action text, maximum integer) returns void
language plpgsql security definer set search_path = '' as $$
declare n integer; stamp timestamptz; actor text;
begin
  if auth.uid() is null then raise exception 'Sign in to continue' using errcode='42501'; end if;
  stamp=to_timestamp(floor(extract(epoch from now())/900)*900);
  actor=auth.uid()::text;
  insert into levelup_private.rate_limits(bucket,window_start,count) values(action||':'||actor,stamp,1)
    on conflict(bucket,window_start) do update set count=levelup_private.rate_limits.count+1 returning count into n;
  if n>maximum then raise exception 'Too many requests. Try again in 15 minutes.' using errcode='P0001'; end if;
  delete from levelup_private.rate_limits where window_start<now()-interval '1 day';
end $$;
create function levelup_private.audit_row() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.levelup_audit_logs(actor,action,entity,changes)
    values(coalesce(auth.uid()::text,'database-maintenance'),lower(TG_OP),TG_TABLE_NAME,
      jsonb_build_object('before',case when TG_OP='INSERT' then null else to_jsonb(OLD) end,'after',to_jsonb(NEW)));
  return NEW;
end $$;
create trigger levelup_students_audit after insert or update on public.levelup_students for each row execute function levelup_private.audit_row();
create trigger levelup_classes_audit after insert or update on public.levelup_classes for each row execute function levelup_private.audit_row();
create trigger levelup_papers_audit after insert or update on public.levelup_papers for each row execute function levelup_private.audit_row();
create trigger levelup_marks_audit after insert or update on public.levelup_marks for each row execute function levelup_private.audit_row();
create trigger levelup_settings_audit after update on levelup_private.settings for each row execute function levelup_private.audit_row();

create function levelup_private.student_json(s public.levelup_students) returns jsonb
language sql stable set search_path = '' as $$ select jsonb_build_object('_id',s.id,'name',s.name,'label',s.label,'classId',s.class_id,'active',s.active) $$;
create function levelup_private.paper_json(p public.levelup_papers) returns jsonb
language sql stable set search_path = '' as $$ select jsonb_build_object('_id',p.id,'name',p.name,'subject',p.subject,'grade',p.grade,'date',coalesce(p.date::text,''),'max',p.max,'classId',p.class_id,'state',p.state,'order',p.position) $$;

create function public.levelup_session() returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Sign in to continue' using errcode='42501'; end if;
  return jsonb_build_object('admin',levelup_private.is_admin(),'accessMode',(select access_mode from levelup_private.settings));
end $$;
create function public.levelup_admin_data() returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  perform levelup_private.require_admin();
  return jsonb_build_object(
    'students',coalesce((select jsonb_agg(levelup_private.student_json(s) order by s.name,s.id) from public.levelup_students s),'[]'),
    'papers',coalesce((select jsonb_agg(levelup_private.paper_json(p) order by p.position,p.id) from public.levelup_papers p),'[]'),
    'classes',coalesce((select jsonb_agg(jsonb_build_object('_id',id,'name',name) order by name) from public.levelup_classes),'[]'),
    'marks',coalesce((select jsonb_agg(jsonb_build_object('studentId',student_id,'paperId',paper_id,'value',value,'status',status)) from public.levelup_marks),'[]'));
end $$;
create function public.levelup_save_class(data jsonb, record_id text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare result_id text; title text;
begin
  perform levelup_private.require_admin();
  if jsonb_typeof(data->'name') is distinct from 'string' then raise exception 'Invalid class name'; end if;
  title=levelup_private.clean(data->>'name');
  if record_id is null then insert into public.levelup_classes(name) values(title) returning id into result_id;
  else update public.levelup_classes set name=title where id=record_id returning id into result_id;
  end if;
  if result_id is null then raise exception 'Class not found'; end if;
  return jsonb_build_object('id',result_id);
end $$;
create function public.levelup_save_student(data jsonb, record_id text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare result_id text; code text; fields public.levelup_students;
begin
  perform levelup_private.require_admin();
  if jsonb_typeof(data->'name') is distinct from 'string' then raise exception 'Invalid student name'; end if;
  fields.name=levelup_private.clean(data->>'name'); fields.label=coalesce(data->>'label','');
  fields.class_id=nullif(data->>'classId',''); fields.active=coalesce((data->>'active')::boolean,true);
  if record_id is null then
    insert into public.levelup_students(name,label,class_id,active) values(fields.name,fields.label,fields.class_id,fields.active) returning id into result_id;
  else
    update public.levelup_students set name=fields.name,label=fields.label,class_id=fields.class_id,active=fields.active where id=record_id returning id into result_id;
  end if;
  if result_id is null then raise exception 'Student not found'; end if;
  code=coalesce(data->>'accessCode','');
  if code<>'' then
    if length(code)<8 or length(code)>64 or octet_length(code)>72 then raise exception 'Access codes need 8–64 characters (maximum 72 bytes)'; end if;
    insert into levelup_private.student_codes(student_id,hash) values(result_id,extensions.crypt(code,extensions.gen_salt('bf',12)))
      on conflict(student_id) do update set hash=excluded.hash;
    delete from levelup_private.student_grants where student_id=result_id;
    insert into public.levelup_audit_logs(actor,action,entity,changes) values(auth.uid()::text,'access-code-reset','student',jsonb_build_object('id',result_id));
  end if;
  return jsonb_build_object('id',result_id);
end $$;
create function public.levelup_save_paper(data jsonb, record_id text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare fields public.levelup_papers; result_id text;
begin
  perform levelup_private.require_admin();
  if jsonb_typeof(data->'name') is distinct from 'string' or jsonb_typeof(data->'max') is distinct from 'number' then raise exception 'Invalid paper'; end if;
  if (data->>'max')::numeric<>trunc((data->>'max')::numeric) then raise exception 'Maximum must be an integer'; end if;
  fields.name=levelup_private.clean(data->>'name'); fields.max=(data->>'max')::integer;
  fields.subject=coalesce(data->>'subject',''); fields.grade=coalesce(data->>'grade',''); fields.date=nullif(data->>'date','')::date;
  fields.class_id=nullif(data->>'classId',''); fields.state=coalesce(data->>'state','draft');
  if record_id is not null and exists(select 1 from public.levelup_marks where paper_id=record_id and value>fields.max) then raise exception 'Maximum is below an existing mark'; end if;
  if record_id is not null and fields.class_id is not null and exists(select 1 from public.levelup_marks m join public.levelup_students s on s.id=m.student_id where m.paper_id=record_id and s.class_id is distinct from fields.class_id and (m.value is not null or m.status='absent')) then raise exception 'Existing results belong to a different class'; end if;
  if record_id is null then
    insert into public.levelup_papers(name,max,subject,grade,date,class_id,state,position)
      values(fields.name,fields.max,fields.subject,fields.grade,fields.date,fields.class_id,fields.state,coalesce((select max(position)+1 from public.levelup_papers),0)) returning id into result_id;
  else
    update public.levelup_papers set name=fields.name,max=fields.max,subject=fields.subject,grade=fields.grade,date=fields.date,class_id=fields.class_id,state=fields.state,updated_at=now() where id=record_id returning id into result_id;
  end if;
  if result_id is null then raise exception 'Paper not found'; end if;
  return jsonb_build_object('id',result_id);
end $$;
create function public.levelup_save_marks(entries jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare entry jsonb; s public.levelup_students; p public.levelup_papers; score numeric; attendance text; n integer;
begin
  perform levelup_private.require_admin();
  if jsonb_typeof(entries) is distinct from 'array' then raise exception 'Provide an array of marks'; end if;
  n=jsonb_array_length(entries);
  if n<1 or n>2000 then raise exception 'Save between 1 and 2000 cells'; end if;
  if (select count(distinct (e->>'studentId',e->>'paperId')) from jsonb_array_elements(entries) e)<>n then raise exception 'Duplicate cell in batch'; end if;
  for entry in select * from jsonb_array_elements(entries) loop
    select * into s from public.levelup_students where id=entry->>'studentId' and active;
    select * into p from public.levelup_papers where id=entry->>'paperId';
    if s.id is null or p.id is null then raise exception 'Unknown or inactive student or paper'; end if;
    if p.class_id is not null and p.class_id is distinct from s.class_id then raise exception 'Student does not belong to this paper class'; end if;
    attendance=coalesce(entry->>'status','present');
    if attendance not in ('present','absent') then raise exception 'Invalid attendance status'; end if;
    if coalesce(jsonb_typeof(entry->'value'),'null') not in ('null','number') then raise exception 'Use a number or blank; formulas are not stored'; end if;
    score=case when attendance='absent' then null else (entry->>'value')::numeric end;
    if score is not null and (score<0 or score>p.max or scale(score)>2) then raise exception 'Mark must be between 0 and %, with at most 2 decimals',p.max; end if;
    insert into public.levelup_marks(student_id,paper_id,value,status,updated_by) values(s.id,p.id,score,attendance,auth.uid())
      on conflict(student_id,paper_id) do update set value=excluded.value,status=excluded.status,updated_at=now(),updated_by=excluded.updated_by;
  end loop;
  -- Any exception rolls back ALL marks and their row-trigger audit entries.
  return jsonb_build_object('ok',true,'count',n);
end $$;
create function public.levelup_reorder_papers(ids jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  perform levelup_private.require_admin();
  if jsonb_typeof(ids) is distinct from 'array' then raise exception 'Provide paper IDs'; end if;
  select count(*) into n from public.levelup_papers;
  if jsonb_array_length(ids)<>n or (select count(distinct value) from jsonb_array_elements_text(ids))<>n or (select count(*) from public.levelup_papers where id in (select jsonb_array_elements_text(ids)))<>n then raise exception 'Provide every paper exactly once'; end if;
  update public.levelup_papers p set position=x.position::integer-1 from jsonb_array_elements_text(ids) with ordinality x(id,position) where p.id=x.id;
  return jsonb_build_object('ok',true);
end $$;
create function public.levelup_admin_audit() returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  perform levelup_private.require_admin();
  return coalesce((select jsonb_agg(jsonb_build_object('_id',id,'actor',actor,'action',action,'entity',entity,'changes',changes,'createdAt',created_at) order by id desc) from (select * from public.levelup_audit_logs order by id desc limit 200) a),'[]');
end $$;
create function public.levelup_set_access_mode(mode text) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  perform levelup_private.require_admin();
  update levelup_private.settings set access_mode=mode;
  return jsonb_build_object('ok',true);
end $$;

create function public.levelup_lookup(name text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare key text; exact_match boolean; profiles jsonb;
begin
  perform levelup_private.throttle('lookup',25);
  key=lower(levelup_private.clean(name));
  if key is null or length(key)<2 or length(key)>100 then raise exception 'Enter a full name of 2–100 characters'; end if;
  select exists(select 1 from public.levelup_students where name_key=key and active) into exact_match;
  select coalesce(jsonb_agg(jsonb_build_object('_id',s.id,'name',s.name,'label',coalesce(nullif(s.label,''),c.name,'Ask your teacher for your profile label')) order by s.rank desc,s.name,s.id),'[]') into profiles
  from (select s0.*,case when exact_match then 1.0 else extensions.similarity(s0.name_key,key)::float end rank from public.levelup_students s0 where s0.active and case when exact_match then s0.name_key=key else extensions.similarity(s0.name_key,key)>=0.25 end order by rank desc,s0.name,s0.id limit case when exact_match then 30 else 5 end) s
  left join public.levelup_classes c on c.id=s.class_id;
  return jsonb_build_object('exact',exact_match,'students',profiles);
end $$;
create function public.levelup_unlock_student(student_id text, code text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare stored text;
begin
  -- Failed attempts return a value instead of raising, so the throttle write commits.
  perform levelup_private.throttle('code',15);
  if code is null or length(code)<8 or length(code)>64 then return jsonb_build_object('ok',false); end if;
  select c.hash into stored from levelup_private.student_codes c join public.levelup_students s on s.id=c.student_id where s.id=levelup_unlock_student.student_id and s.active;
  -- Always do a costly comparison, including unknown profiles.
  stored=coalesce(stored,'$2a$12$XfBICb8dJf6eLEhTtjlMdOzII0S17uBvUbr2vIWcG7SCiI5Yj4y2W');
  if stored is distinct from extensions.crypt(code,stored) then return jsonb_build_object('ok',false); end if;
  if not exists(select 1 from levelup_private.student_codes c where c.student_id=levelup_unlock_student.student_id) then return jsonb_build_object('ok',false); end if;
  insert into levelup_private.student_grants(user_id,student_id,expires_at) values(auth.uid(),student_id,now()+interval '8 hours')
    on conflict(user_id) do update set student_id=excluded.student_id,expires_at=excluded.expires_at;
  return jsonb_build_object('ok',true);
end $$;
create function public.levelup_results(student_id text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare student public.levelup_students; papers jsonb;
begin
  perform levelup_private.throttle('results',120);
  if (select access_mode from levelup_private.settings)='code' and not exists(select 1 from levelup_private.student_grants g where g.user_id=auth.uid() and g.student_id=levelup_results.student_id and g.expires_at>now()) then raise exception 'Enter your student access code' using errcode='42501'; end if;
  select * into student from public.levelup_students where id=levelup_results.student_id and active;
  if student.id is null then raise exception 'Profile unavailable' using errcode='P0002'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'name',p.name,'subject',p.subject,'date',coalesce(p.date::text,''),'max',p.max,'value',m.value) order by p.position,p.id),'[]') into papers
    from public.levelup_papers p join public.levelup_marks m on m.paper_id=p.id
    where m.student_id=student.id and p.state='published' and (p.class_id is null or p.class_id=student.class_id)
      and m.status='present' and m.value is not null and m.value between 0 and p.max;
  return jsonb_build_object('student',student.name,'papers',papers);
end $$;

-- PostgreSQL grants EXECUTE to PUBLIC on new functions by default: explicitly close it.
revoke execute on all functions in schema levelup_private from public,anon,authenticated;
revoke execute on function public.levelup_session(),public.levelup_admin_data(),public.levelup_save_class(jsonb,text),public.levelup_save_student(jsonb,text),public.levelup_save_paper(jsonb,text),public.levelup_save_marks(jsonb),public.levelup_reorder_papers(jsonb),public.levelup_admin_audit(),public.levelup_set_access_mode(text),public.levelup_lookup(text),public.levelup_unlock_student(text,text),public.levelup_results(text) from public,anon;
grant execute on function public.levelup_session(),public.levelup_admin_data(),public.levelup_save_class(jsonb,text),public.levelup_save_student(jsonb,text),public.levelup_save_paper(jsonb,text),public.levelup_save_marks(jsonb),public.levelup_reorder_papers(jsonb),public.levelup_admin_audit(),public.levelup_set_access_mode(text),public.levelup_lookup(text),public.levelup_unlock_student(text,text),public.levelup_results(text) to authenticated;
commit;
