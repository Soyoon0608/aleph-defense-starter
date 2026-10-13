-- 10단계: 시험 계정 B의 메모 한 건을 침해 전에 비공개 사본으로 보관합니다.
-- 실제 owner_id(UUID)는 Git에 기록하지 않습니다.
-- 현재 자료실에서 메모를 정확히 한 건 가진 소유자 한 명만 B 백업 대상으로 선택합니다.
-- 기존 백업이 있으면 덮어쓰지 않습니다.

begin;

lock table public.byteback_notes in share mode;

create extension if not exists pgcrypto with schema extensions;

create table if not exists public.byteback_notes_backup (
  id uuid primary key,
  owner_id uuid not null,
  title text not null,
  content text not null,
  content_sha256 text not null
    check (content_sha256 ~ '^[0-9a-f]{64}$'),
  sample_marker text,
  backed_up_at timestamptz not null default now()
);

alter table public.byteback_notes_backup enable row level security;

revoke all on table public.byteback_notes_backup from public;
revoke all on table public.byteback_notes_backup from anon;
revoke all on table public.byteback_notes_backup from authenticated;

grant select on table public.byteback_notes_backup to service_role;

do $$
declare
  candidate_count integer;
begin
  select count(*)
    into candidate_count
    from (
      select owner_id
      from public.byteback_notes
      group by owner_id
      having count(*) = 1
    ) candidates;

  if candidate_count <> 1 then
    raise exception
      '시험 계정 B 후보가 정확히 한 명이어야 합니다. 현재: %',
      candidate_count;
  end if;
end
$$;

insert into public.byteback_notes_backup (
  id,
  owner_id,
  title,
  content,
  content_sha256,
  sample_marker
)
select
  n.id,
  n.owner_id,
  n.title,
  n.content,
  encode(
    extensions.digest(convert_to(n.content, 'UTF8'), 'sha256'),
    'hex'
  ),
  n.sample_marker
from public.byteback_notes n
where n.owner_id = (
  select owner_id
  from public.byteback_notes
  group by owner_id
  having count(*) = 1
)
on conflict (id) do nothing;

do $$
declare
  backup_count integer;
begin
  select count(*)
    into backup_count
    from public.byteback_notes_backup;

  if backup_count <> 1 then
    raise exception
      '검증된 B 백업이 정확히 한 건이어야 합니다. 현재: %',
      backup_count;
  end if;

  if exists (
    select 1
    from public.byteback_notes_backup
    where content_sha256 <>
      encode(
        extensions.digest(convert_to(content, 'UTF8'), 'sha256'),
        'hex'
      )
  ) then
    raise exception '백업 내용 해시 검증에 실패했습니다.';
  end if;
end
$$;

commit;
