import assert from 'node:assert/strict';
import { test } from 'node:test';
import { identifyResource } from '../src/resource-identity.mjs';

test('identifies exact note item GET and PUT routes with no query', () => {
  for (const [method, route, path, operation] of [
    ['GET', '/notes/:id', '/notes/demo', 'read'],
    ['PUT', '/notes/:id', '/notes/demo', 'update'],
    ['GET', '/api/notes/:id', '/api/notes/demo', 'read'],
    ['PUT', '/api/notes/:id', '/api/notes/demo', 'update']
  ]) {
    assert.deepEqual(identifyResource({
      service: 'notes', method, route: `${method} ${route}`, path, queryLength: 0
    }), {
      resourceType: 'student-note', resourceId: 'demo', operation
    });
  }
});

test('does not identify collections, reserved paths, writes, or query-selected routes', () => {
  for (const [method, route, path, queryLength] of [
    ['GET', '/notes', '/notes', 0],
    ['GET', '/api/notes', '/api/notes', 0],
    ['GET', '/notes/:id', '/notes/all', 0],
    ['GET', '/api/notes/:id', '/api/notes/all', 0],
    ['GET', '/notes/:id', '/notes/export', 0],
    ['GET', '/api/notes/:id', '/api/notes/export', 0],
    ['POST', '/notes/:id', '/notes/demo', 0],
    ['PATCH', '/api/notes/:id', '/api/notes/demo', 0],
    ['DELETE', '/notes/:id', '/notes/demo', 0],
    ['GET', '/notes/:id', '/notes/demo', 4]
  ]) {
    assert.equal(identifyResource({
      service: 'notes', method, route: `${method} ${route}`, path, queryLength
    }), null);
  }
});

test('does not infer resources from another service or mismatched request tuples', () => {
  for (const request of [
    { service: 'announcements', method: 'GET', path: '/api/notes/demo',
      route: 'GET /api/notes/:id', queryLength: 0 },
    { service: 'other', method: 'GET', path: '/api/notes/demo',
      route: 'GET /api/notes/:id', queryLength: 0 },
    { method: 'GET', path: '/api/notes/demo',
      route: 'GET /api/notes/:id', queryLength: 0 },
    { service: 'notes', method: 'GET', path: '/api/notes/demo',
      route: 'GET /api/notes/:other', queryLength: 0 },
    { service: 'notes', method: 'GET', path: '/api/notes/demo',
      route: '', queryLength: 0 },
    { service: 'notes', method: 'GET', path: '/api/notes/demo/',
      route: 'GET /api/notes/:id', queryLength: 0 }
  ]) {
    assert.equal(identifyResource(request), null);
  }
});
