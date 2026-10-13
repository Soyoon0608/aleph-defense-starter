const resources = Object.freeze([
  {
    service: 'notes',
    route: '/notes/:id',
    path: /^\/notes\/([^/?#]+)$/u,
    operations: Object.freeze({ GET: 'read', PUT: 'update' })
  },
  {
    service: 'notes',
    route: '/api/notes/:id',
    path: /^\/api\/notes\/([^/?#]+)$/u,
    operations: Object.freeze({ GET: 'read', PUT: 'update' })
  }
]);

const reservedIds = new Set(['all', 'export']);

export function identifyResource(request) {
  if (!request || typeof request !== 'object' || Array.isArray(request)
      || request.queryLength !== 0) return null;

  for (const resource of resources) {
    const operation = resource.operations[request.method];
    if (request.service !== resource.service || !operation
        || request.route !== `${request.method} ${resource.route}`
        || typeof request.path !== 'string') continue;

    const match = resource.path.exec(request.path);
    if (!match || reservedIds.has(match[1].toLowerCase())) continue;

    return {
      resourceType: 'student-note',
      resourceId: match[1],
      operation
    };
  }

  return null;
}
