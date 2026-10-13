const resources = Object.freeze([
  {
    service: 'notes',
    route: '/notes/:id',
    path: /^\/notes\/([^/?#]+)$/u,
    namespace: 'student-note',
    resourceType: 'student-note',
    operations: Object.freeze({ GET: 'read', PUT: 'update' })
  },
  {
    service: 'announcements',
    route: '/announcements/:id',
    path: /^\/announcements\/([^/?#]+)$/u,
    namespace: 'instructor-announcement',
    resourceType: 'instructor-announcement',
    operations: Object.freeze({
      GET: 'read', POST: 'write', PUT: 'write', PATCH: 'write', DELETE: 'write'
    })
  },
  {
    service: 'announcements',
    route: '/announcements',
    path: /^\/announcements$/u,
    resourceId: 'instructor-announcements',
    resourceType: 'instructor-announcement',
    operations: Object.freeze({ POST: 'write', PUT: 'write', PATCH: 'write', DELETE: 'write' })
  }
]);

export function identifyResource(request) {
  if (!request || typeof request !== 'object' || Array.isArray(request)) return null;

  for (const resource of resources) {
    const operation = resource.operations[request.method];
    if (request.service !== resource.service || !operation
        || request.route !== `${request.method} ${resource.route}`
        || typeof request.path !== 'string') continue;

    const match = resource.path.exec(request.path);
    if (!match) continue;

    return {
      resourceType: resource.resourceType,
      resourceId: resource.resourceId ?? `${resource.namespace}:${match[1]}`,
      operation
    };
  }

  return null;
}