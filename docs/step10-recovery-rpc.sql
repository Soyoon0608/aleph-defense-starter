-- 10단계: 검증된 메모 한 건만 DB 내부에서 복구합니다.
-- 호출자는 반드시 검증된 note id와 owner id를 전달해야 합니다.

begin;

create or replace function public.byteback_restore_note(
  p_id uuid,
  p_owner uuid
)
returns table (
  id uuid,
  restored boolean,
  content_hash text,
  record_hash text,
  owner_matched boolean
)
language plpgsql
security invoker
set search_path = public, extensions, pg_temp
as $$
declare
  backup_row public.byteback_notes_backup%rowtype;
  restored_row public.byteback_notes%rowtype;
  expected_content_hash text;
  expected_record_hash text;
begin
  -- 복구 대상은 ID와 소유자가 모두 일치하는 안전 사본 한 건이어야 합니다.
  select *
    into backup_row
    from public.byteback_notes_backup
   where byteback_notes_backup.id = p_id
     and byteback_notes_backup.owner_id = p_owner;

  if not found then
    raise exception 'verified_backup_not_found';
  end if;

  if backup_row.backup_version <> 1 then
    raise exception 'unsupported_backup_version';
  end if;

  expected_content_hash :=
    encode(
      extensions.digest(
        convert_to(backup_row.content, 'UTF8'),
        'sha256'
      ),
      'hex'
    );

  expected_record_hash :=
    public.byteback_note_record_sha256(
      backup_row.title,
      backup_row.content
    );

  if backup_row.content_sha256 <> expected_content_hash
     or backup_row.record_sha256 <> expected_record_hash then
    raise exception 'backup_integrity_failed';
  end if;

  -- 삭제된 경우에는 삽입하고,
  -- 같은 소유자의 기존 행이면 안전 사본으로 되돌립니다.
  -- 같은 ID지만 다른 소유자의 행은 덮어쓰지 않습니다.
  insert into public.byteback_notes (
    id,
    owner_id,
    title,
    content,
    sample_marker
  )
  values (
    backup_row.id,
    backup_row.owner_id,
    backup_row.title,
    backup_row.content,
    backup_row.sample_marker
  )
  on conflict (id) do update
  set
    title = excluded.title,
    content = excluded.content,
    sample_marker = excluded.sample_marker
  where public.byteback_notes.owner_id = excluded.owner_id;

  -- upsert 결과를 믿지 않고 실제 저장된 행을 다시 읽습니다.
  select *
    into restored_row
    from public.byteback_notes
   where byteback_notes.id = p_id
     and byteback_notes.owner_id = p_owner;

  if not found then
    raise exception 'restore_owner_mismatch';
  end if;

  if restored_row.title <> backup_row.title
     or restored_row.content <> backup_row.content
     or public.byteback_note_record_sha256(
          restored_row.title,
          restored_row.content
        ) <> expected_record_hash then
    raise exception 'restore_verification_failed';
  end if;

  return query
  select
    restored_row.id,
    true,
    expected_content_hash,
    expected_record_hash,
    restored_row.owner_id = p_owner;
end;
$$;

revoke all on function
  public.byteback_restore_note(uuid, uuid)
from public;

revoke all on function
  public.byteback_restore_note(uuid, uuid)
from anon;

revoke all on function
  public.byteback_restore_note(uuid, uuid)
from authenticated;

grant execute on function
  public.byteback_restore_note(uuid, uuid)
to service_role;

commit;
