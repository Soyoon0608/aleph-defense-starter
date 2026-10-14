-- 10단계 복구 저장소 강화
-- 기존 byteback_notes_backup 행은 절대 덮어쓰지 않습니다.
-- 현재 모든 메모를 최초 1회 백업하고,
-- 이후 INSERT는 최초 상태, UPDATE/DELETE는 변경 전 상태를 보존합니다.

begin;

lock table public.byteback_notes in share row exclusive mode;

create extension if not exists pgcrypto with schema extensions;

alter table public.byteback_notes_backup
  add column if not exists backup_version integer not null default 1;

alter table public.byteback_notes_backup
  add column if not exists record_sha256 text;

-- 제목 + 본문을 함께 검증하는 해시입니다.
create or replace function public.byteback_note_record_sha256(
  p_title text,
  p_content text
)
returns text
language sql
immutable
strict
set search_path = public, extensions, pg_temp
as $$
  select encode(
    extensions.digest(
      convert_to(
        octet_length(convert_to(p_title, 'UTF8'))::text
        || ':' || p_title
        || octet_length(convert_to(p_content, 'UTF8'))::text
        || ':' || p_content,
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  );
$$;

-- 이미 존재하는 B 사본도 그대로 유지하면서 새 검증값만 채웁니다.
update public.byteback_notes_backup
set record_sha256 =
  public.byteback_note_record_sha256(title, content)
where record_sha256 is null;

alter table public.byteback_notes_backup
  alter column record_sha256 set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid =
      'public.byteback_notes_backup'::regclass
      and conname =
        'byteback_notes_backup_record_sha256_check'
  ) then
    alter table public.byteback_notes_backup
      add constraint
        byteback_notes_backup_record_sha256_check
      check (record_sha256 ~ '^[0-9a-f]{64}$');
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid =
      'public.byteback_notes_backup'::regclass
      and conname =
        'byteback_notes_backup_version_check'
  ) then
    alter table public.byteback_notes_backup
      add constraint
        byteback_notes_backup_version_check
      check (backup_version = 1);
  end if;
end
$$;

-- 현재 존재하는 모든 메모를 백업합니다.
-- 이미 백업된 ID는 절대로 갱신하지 않습니다.
insert into public.byteback_notes_backup (
  id,
  owner_id,
  title,
  content,
  content_sha256,
  record_sha256,
  sample_marker,
  backup_version
)
select
  n.id,
  n.owner_id,
  n.title,
  n.content,
  encode(
    extensions.digest(
      convert_to(n.content, 'UTF8'),
      'sha256'
    ),
    'hex'
  ),
  public.byteback_note_record_sha256(
    n.title,
    n.content
  ),
  n.sample_marker,
  1
from public.byteback_notes n
on conflict (id) do nothing;

-- 앞으로 변경되기 전 최초 상태를 자동 보존합니다.
create or replace function
  public.byteback_capture_note_backup()
returns trigger
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  source_row public.byteback_notes%rowtype;
begin
  if tg_op = 'INSERT' then
    source_row := new;
  else
    source_row := old;
  end if;

  insert into public.byteback_notes_backup (
    id,
    owner_id,
    title,
    content,
    content_sha256,
    record_sha256,
    sample_marker,
    backup_version
  )
  values (
    source_row.id,
    source_row.owner_id,
    source_row.title,
    source_row.content,
    encode(
      extensions.digest(
        convert_to(source_row.content, 'UTF8'),
        'sha256'
      ),
      'hex'
    ),
    public.byteback_note_record_sha256(
      source_row.title,
      source_row.content
    ),
    source_row.sample_marker,
    1
  )
  on conflict (id) do nothing;

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

revoke all on function
  public.byteback_capture_note_backup()
from public, anon, authenticated;

drop trigger if exists
  byteback_capture_note_backup
on public.byteback_notes;

create trigger byteback_capture_note_backup
before insert or update or delete
on public.byteback_notes
for each row
execute function public.byteback_capture_note_backup();

-- 저장된 사본 자체의 무결성을 마지막으로 확인합니다.
do $$
begin
  if exists (
    select 1
    from public.byteback_notes_backup
    where content_sha256 <>
      encode(
        extensions.digest(
          convert_to(content, 'UTF8'),
          'sha256'
        ),
        'hex'
      )
      or record_sha256 <>
        public.byteback_note_record_sha256(
          title,
          content
        )
  ) then
    raise exception
      '백업 무결성 검증에 실패했습니다.';
  end if;

  if exists (
    select 1
    from public.byteback_notes n
    where not exists (
      select 1
      from public.byteback_notes_backup b
      where b.id = n.id
    )
  ) then
    raise exception
      '현재 메모 중 백업되지 않은 행이 있습니다.';
  end if;
end
$$;

commit;
