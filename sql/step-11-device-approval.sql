-- 11단계 기기 승인 상태
-- 승인 요청과 실제 등록 권한을 분리합니다.
-- 앱 서버는 principal_bindings를 조회만 하며 승인 권한을 만들지 않습니다.

begin;

create table if not exists public.principal_bindings (
  class_id text not null,
  project_id text not null,
  subject_id text not null,
  device_id text not null
    check (device_id ~ '^[a-f0-9]{16}$'),
  user_id uuid not null references auth.users(id),
  enabled boolean not null default false,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  primary key (
    class_id,
    project_id,
    subject_id,
    device_id
  )
);

alter table public.principal_bindings
  enable row level security;

revoke all
  on public.principal_bindings
  from public, anon, authenticated, service_role;

grant select
  on public.principal_bindings
  to service_role;


create table if not exists public.device_approval_requests (
  class_id text not null,
  project_id text not null,
  subject_id text not null,
  device_id text not null
    check (device_id ~ '^[a-f0-9]{16}$'),
  user_id uuid not null references auth.users(id),
  requested_at timestamptz not null default now(),
  primary key (
    class_id,
    project_id,
    subject_id,
    device_id,
    user_id
  )
);

alter table public.device_approval_requests
  enable row level security;

revoke all
  on public.device_approval_requests
  from public, anon, authenticated;

grant select, insert, update
  on public.device_approval_requests
  to service_role;

commit;
