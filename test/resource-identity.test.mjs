import assert from 'node:assert/strict';
import { test } from 'node:test';
import { identifyResource } from '../src/resource-identity.mjs';

test('identifies a student note from the exact notes request tuple', () => {
  assert.deepEqual(identifyResource({
    service: 'notes', method: 'GET', path: '/notes/demo', route: 'GET /notes/:id'
  }), {
    resourceType: 'student-note', resourceId: 'student-note:demo', operation: 'read'
  });
});

test('does not identify the student note collection routes', () => {
  assert.equal(identifyResource({
    service: 'notes', method: 'GET', path: '/notes', route: 'GET /notes'
  }), null);
  assert.equal(identifyResource({
    service: 'notes', method: 'POST', path: '/notes', route: 'POST /notes'
  }), null);
});

test('identifies announcement reads and marks writes as write operations', () => {
  assert.deepEqual(identifyResource({
    service: 'announcements', method: 'GET', path: '/announcements/demo',
    route: 'GET /announcements/:id'
  }), {
    resourceType: 'instructor-announcement',
    resourceId: 'instructor-announcement:demo', operation: 'read'
  });
  assert.deepEqual(identifyResource({
    service: 'announcements', method: 'PUT', path: '/announcements/demo',
    route: 'PUT /announcements/:id'
  }), {
    resourceType: 'instructor-announcement',
    resourceId: 'instructor-announcement:demo', operation: 'write'
  });
  for (const method of ['POST', 'PATCH', 'DELETE']) {
    assert.deepEqual(identifyResource({
      service: 'announcements', method, path: '/announcements/demo',
      route: `${method} /announcements/:id`
    }), {
      resourceType: 'instructor-announcement',
      resourceId: 'instructor-announcement:demo', operation: 'write'
    });
  }
  assert.deepEqual(identifyResource({
    service: 'announcements', method: 'POST', path: '/announcements',
    route: 'POST /announcements'
  }), {
    resourceType: 'instructor-announcement',
    resourceId: 'instructor-announcements', operation: 'write'
  });
});

test('does not infer resources from unknown or mismatched request tuples', () => {
  assert.equal(identifyResource({
    service: 'announcements', method: 'GET', path: '/announcements/demo/extra',
    route: 'GET /announcements/:id'
  }), null);
  assert.equal(identifyResource({
    service: 'announcements', method: 'GET', path: '/announcements/demo',
    route: 'GET /notes/:id'
  }), null);
  assert.equal(identifyResource({
    service: 'teachers', method: 'GET', path: '/announcements/demo',
    route: 'GET /announcements/:id'
  }), null);
  assert.equal(identifyResource({
    service: 'notes', method: 'PUT', path: '/notes/demo',
    route: 'PATCH /notes/:id'
  }), null);
  assert.equal(identifyResource({
    service: 'notes', method: 'DELETE', path: '/notes/demo',
    route: 'DELETE /notes/:id'
  }), null);
  assert.equal(identifyResource({
    service: 'notes', method: 'GET', path: '/notes/demo?all=true',
    route: 'GET /notes/:id'
  }), null);
});