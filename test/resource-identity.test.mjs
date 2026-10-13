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

test('preserves the existing student note collection routes', () => {
  assert.deepEqual(identifyResource({
    service: 'notes', method: 'GET', path: '/notes', route: 'GET /notes'
  }), {
    resourceType: 'student-note-collection', resourceId: 'student-notes', operation: 'list'
  });
  assert.deepEqual(identifyResource({
    service: 'notes', method: 'POST', path: '/notes', route: 'POST /notes'
  }), {
    resourceType: 'student-note-collection', resourceId: 'student-notes', operation: 'create'
  });
});

test('identifies an instructor announcement and preserves its operation', () => {
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
    resourceId: 'instructor-announcement:demo', operation: 'update'
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
});