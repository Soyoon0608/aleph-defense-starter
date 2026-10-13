const resources = Object.freeze([
  {
    service: 'notes',
    resourceType: 'student-note',
    route: '/notes/:id',
    path: /^\/notes\/([^/?#]+)$/u,
    operations: Object.freeze({
      GET: 'read',
      PUT: 'update'
    })
  },
  {
    service: 'notes',
    resourceType: 'student-note',
    route: '/api/notes/:id',
    path: /^\/api\/notes\/([^/?#]+)$/u,
    operations: Object.freeze({
      GET: 'read',
      PUT: 'update'
    })
  },

  // 8단계: 반 공지 구역
  // GET뿐 아니라 쓰기 요청도 "공지 구역"으로 식별해서
  // decider가 resource-zone 규칙으로 명시적으로 거부할 수 있게 합니다.
  {
    service: 'announcements',
    resourceType: 'instructor-announcement',
    route: '/announcements/:id',
    path: /^\/announcements\/([^/?#]+)$/u,
    operations: Object.freeze({
      GET: 'read',
      POST: 'write',
      PUT: 'write',
      PATCH: 'write',
      DELETE: 'write'
    })
  },
  {
    service: 'announcements',
    resourceType: 'instructor-announcement',
    route: '/api/announcements/:id',
    path: /^\/api\/announcements\/([^/?#]+)$/u,
    operations: Object.freeze({
      GET: 'read',
      POST: 'write',
      PUT: 'write',
      PATCH: 'write',
      DELETE: 'write'
    })
  }
,
  {
    service: 'announcements',
    resourceType: 'instructor-announcement',
    resourceId: 'instructor-announcements',
    route: '/announcements',
    path: /^\/announcements$/u,
    operations: Object.freeze({
      POST: 'write',
      PUT: 'write',
      PATCH: 'write',
      DELETE: 'write'
    })
  },
  {
    service: 'announcements',
    resourceType: 'instructor-announcement',
    resourceId: 'instructor-announcements',
    route: '/api/announcements',
    path: /^\/api\/announcements$/u,
    operations: Object.freeze({
      POST: 'write',
      PUT: 'write',
      PATCH: 'write',
      DELETE: 'write'
    })
  }
]);

const reservedIds = new Set(['all', 'export']);

export function identifyResource(request) {
  if (!request || typeof request !== 'object' || Array.isArray(request)
      || request.queryLength !== 0) return null;

  for (const resource of resources) {
    const operation = resource.operations[request.method];

    if (request.service !== resource.service
        || !operation
        || request.route !== `${request.method} ${resource.route}`
        || typeof request.path !== 'string') {
      continue;
    }

    const match = resource.path.exec(request.path);

    if (!match) {
      continue;
    }

    const dynamicId = match[1] ?? null;
    const resourceId = resource.resourceId ?? dynamicId;

    if (dynamicId && reservedIds.has(dynamicId.toLowerCase())) {
      continue;
    }

    if (typeof resourceId !== 'string' || !resourceId) {
      continue;
    }

    return {
      resourceType: resource.resourceType,
      resourceId,
      operation
    };
  }

  return null;
}
