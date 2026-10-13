import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fixtureRequests } from '../scripts/fixture-7.mjs';
import { scopeOwnedNote } from '../src/notes-api.mjs';
import { handleNotes } from '../src/notes-api.mjs';
import { decide, RULE_IDS } from '../src/decider.mjs';
import { identifyResource } from '../src/resource-identity.mjs';
import { runAttackChecks } from '../src/attack-check.mjs';
import config from '../aleph.config.json' with { type: 'json' };

function fakeNoteQuery(rows, ignoreOwnerFilter = false) {
  const filters = [];
  let update = null;
  let deleting = false;
  return {
    eq(field, value) {
      filters.push([field, value]);
      return this;
    },
    select() {
      return this;
    },
    update(values) {
      update = values;
      return this;
    },
    delete() {
      deleting = true;
      return this;
    },
    async insert(values) {
      rows.push(values);
      return { error: null };
    },
    async maybeSingle() {
      const rowIndex = rows.findIndex(item => filters.every(([field, value]) =>
        (ignoreOwnerFilter && field === 'owner_id') || item[field] === value));
      if (rowIndex === -1) return { data: null, error: null };
      const row = rows[rowIndex];
      if (deleting) {
        rows.splice(rowIndex, 1);
        return { data: { id: row.id }, error: null };
      }
      if (update) Object.assign(row, update);
      return { data: update ? { id: row.id } : row, error: null };
    },
    async order() {
      const data = rows.filter(item => filters.every(([field, value]) =>
        (ignoreOwnerFilter && field === 'owner_id') || item[field] === value));
      return { data, error: null };
    }
  };
}

function fakeNotesClient(rows, ignoreOwnerFilter = false) {
  return {
    from(table) {
      assert.equal(table, 'byteback_notes');
      return fakeNoteQuery(rows, ignoreOwnerFilter);
    }
  };
}

function fakeResponse() {
  return {
    headers: {},
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; }
  };
}

async function callNotesApi({ rows, userId, identity, kind = 'student', method, body,
  single = true, ignoreOwnerFilter = false, noteId = '00000000-0000-4000-8000-000000000001' }) {
  const response = fakeResponse();
  await handleNotes({
    method,
    headers: {},
    query: single ? { id: noteId } : {},
    body
  }, response, single, {
    supabaseUrl: new URL(config.identityProvider.issuer).origin,
    verifyLogin: async () => ({ kind, userId, identity }),
    createClient: () => fakeNotesClient(rows, ignoreOwnerFilter)
  });
  return response;
}

test('allows exact student note API GET and PUT candidates on a registered device', async () => {
  const normal = fixtureRequests().normal;
  for (const [prefix, routePrefix] of [['/notes', '/notes'], ['/api/notes', '/api/notes']]) {
    for (const [method, expectedOperation] of [['GET', 'read'], ['PUT', 'update']]) {
      const request = {
        ...normal,
        service: 'notes',
        method,
        path: `${prefix}/note-a`,
        route: `${method} ${routePrefix}/:id`,
        queryLength: 0
      };
      const resource = identifyResource(request);
      const response = await decide(request);
      assert.equal(resource?.operation, expectedOperation);
      assert.equal(resource?.resourceType, 'student-note');
      assert.equal(response.decision, 'allow');
      assert.equal(response.reasonCode, 'approved');
      assert.ok(RULE_IDS.includes('resource_zone'));
    }
  }
});

test('direct notes API returns A note to A and denies B read and update', async () => {
  const rows = [{
    id: '00000000-0000-4000-8000-000000000001',
    owner_id: 'auth-user-a',
    title: 'A note',
    content: 'Original body'
  }];
  const aRead = await callNotesApi({ rows, userId: 'auth-user-a', method: 'GET' });
  assert.equal(aRead.statusCode, 200);
  assert.equal(aRead.body.body, 'Original body');

  const bRead = await callNotesApi({ rows, userId: 'auth-user-b', method: 'GET' });
  assert.equal(bRead.statusCode, 404);

  const bReadFromUnfilteredQuery = await callNotesApi({ rows, userId: 'auth-user-b',
    method: 'GET', ignoreOwnerFilter: true });
  assert.equal(bReadFromUnfilteredQuery.statusCode, 404);

  const bUpdate = await callNotesApi({ rows, userId: 'auth-user-b', method: 'PUT',
    body: { title: 'Changed by B', body: 'Unauthorized change' } });
  assert.equal(bUpdate.statusCode, 404);
  assert.equal(rows[0].content, 'Original body');

  const aUpdate = await callNotesApi({ rows, userId: 'auth-user-a', method: 'PUT',
    body: { title: 'Changed by A', body: 'Authorized change' } });
  assert.equal(aUpdate.statusCode, 200);
  assert.equal(rows[0].content, 'Authorized change');
});

test('judge identity separates A and B when their userId is shared', async () => {
  const noteId = '00000000-0000-4000-8000-000000000001';
  const rows = [{
    id: noteId, owner_id: 'a', title: 'A note', content: 'Original body'
  }];
  const aRead = await callNotesApi({ rows, kind: 'judge', userId: 'shared-sub',
    identity: 'a', method: 'GET', noteId });
  const bRead = await callNotesApi({ rows, kind: 'judge', userId: 'shared-sub',
    identity: 'b', method: 'GET', noteId });
  const aUpdate = await callNotesApi({ rows, kind: 'judge', userId: 'shared-sub',
    identity: 'a', method: 'PUT', noteId,
    body: { title: 'A updated', body: 'A body' } });
  const bUpdate = await callNotesApi({ rows, kind: 'judge', userId: 'shared-sub',
    identity: 'b', method: 'PUT', noteId,
    body: { title: 'B overwrite', body: 'B body' } });

  assert.equal(aRead.statusCode, 200);
  assert.equal(bRead.statusCode, 404);
  assert.equal(aUpdate.statusCode, 200);
  assert.equal(bUpdate.statusCode, 404);
  assert.equal(rows[0].content, 'A body');
});

test('judge requests without a verified A/B identity fail closed', async () => {
  const rows = [{ id: 'note-a', owner_id: 'a', title: 'A note', content: 'A body' }];
  for (const identity of [undefined, 'c']) {
    const response = await callNotesApi({ rows, kind: 'judge', userId: 'shared-sub',
      identity, method: 'GET', noteId: 'note-a' });
    assert.equal(response.statusCode, 403);
  }
});

test('student CRUD continues to use the verified userId owner key', async () => {
  const rows = [];
  const userId = 'student-sub';
  const created = await callNotesApi({ rows, userId, method: 'POST', single: false,
    body: { title: 'Student note', body: 'Student body' } });
  assert.equal(created.statusCode, 201);
  assert.equal(rows[0].owner_id, userId);

  const read = await callNotesApi({ rows, userId, method: 'GET', noteId: created.body.id });
  assert.equal(read.statusCode, 200);
  const updated = await callNotesApi({ rows, userId, method: 'PUT', noteId: created.body.id,
    body: { title: 'Updated note', body: 'Updated body' } });
  assert.equal(updated.statusCode, 200);
  const deleted = await callNotesApi({ rows, userId, method: 'DELETE', noteId: created.body.id });
  assert.equal(deleted.statusCode, 200);
  assert.equal(rows.length, 0);
});

test('notes API list remains scoped to the verified owner', async () => {
  const rows = [
    { id: 'note-a', owner_id: 'auth-user-a', title: 'A note', content: 'A body' },
    { id: 'note-b', owner_id: 'auth-user-b', title: 'B note', content: 'B body' }
  ];
  const aList = await callNotesApi({ rows, userId: 'auth-user-a', method: 'GET', single: false });
  const bList = await callNotesApi({ rows, userId: 'auth-user-b', method: 'GET', single: false });

  assert.equal(aList.statusCode, 200);
  assert.deepEqual(aList.body.map(note => note.id), ['note-a']);
  assert.equal(bList.statusCode, 200);
  assert.deepEqual(bList.body.map(note => note.id), ['note-b']);
});

test('notes API rejects a body role instead of treating it as instructor authority', async () => {
  const rows = [{
    id: '00000000-0000-4000-8000-000000000001',
    owner_id: 'auth-user-a',
    title: 'A note',
    content: 'Original body'
  }];
  const response = await callNotesApi({ rows, userId: 'auth-user-a', method: 'PUT',
    body: { title: 'Changed', body: 'No role override', role: 'teacher' } });

  assert.equal(response.statusCode, 400);
  assert.equal(rows[0].content, 'Original body');
});

test('8-stage bundle check covers the virtual resource-zone cases', async () => {
  const results = await runAttackChecks({ ...config, step: 8 });
  assert.deepEqual(results.map(result => result.attackId), [
    'self_note_read',
    'self_note_api_read',
    'self_note_update',
    'self_note_api_update',
    'cross_note_api_read',
    'cross_note_api_update',
    'body_role_rejected',
    'note_collection_read_denied',
    'api_note_collection_read_denied',
    'functional_note_path__notes_all_denied',
    'functional_note_path__api_notes_all_denied',
    'functional_note_path__notes_export_denied',
    'functional_note_path__api_notes_export_denied',
    'note_query_selection_denied',
    'unknown_resource_path',
    'resource_route_mismatch'
  ]);
});

test('denies note collections, reserved paths, unsupported methods, and mismatches', async () => {
  const normal = fixtureRequests().normal;
  const denyCases = [
    ['GET', '/notes', 'GET /notes', 0],
    ['GET', '/api/notes', 'GET /api/notes', 0],
    ['POST', '/notes', 'POST /notes', 0],
    ['PUT', '/notes', 'PUT /notes', 0],
    ['PATCH', '/notes', 'PATCH /notes', 0],
    ['DELETE', '/notes', 'DELETE /notes', 0],
    ['POST', '/api/notes', 'POST /api/notes', 0],
    ['PUT', '/api/notes', 'PUT /api/notes', 0],
    ['PATCH', '/api/notes', 'PATCH /api/notes', 0],
    ['DELETE', '/api/notes', 'DELETE /api/notes', 0],
    ['GET', '/notes/all', 'GET /notes/:id', 0],
    ['GET', '/api/notes/all', 'GET /api/notes/:id', 0],
    ['GET', '/notes/export', 'GET /notes/:id', 0],
    ['GET', '/api/notes/export', 'GET /api/notes/:id', 0],
    ['POST', '/notes/note-a', 'POST /notes/:id', 0],
    ['PATCH', '/notes/note-a', 'PATCH /notes/:id', 0],
    ['DELETE', '/notes/note-a', 'DELETE /notes/:id', 0],
    ['POST', '/api/notes/note-a', 'POST /api/notes/:id', 0],
    ['PATCH', '/api/notes/note-a', 'PATCH /api/notes/:id', 0],
    ['DELETE', '/api/notes/note-a', 'DELETE /api/notes/:id', 0],
    ['GET', '/api/notes/note-a', 'GET /api/notes/:id', 6],
    ['GET', '/api/notes/note-a', 'GET /api/notes/:other', 0],
    ['GET', '/api/notes/note-a', 'GET /api/notes/:id', 0, 'announcements']
  ];
  for (const [method, path, route, queryLength, service = 'notes'] of denyCases) {
    const response = await decide({
      ...normal, service, method, path, route, queryLength
    });
    assert.equal(response.decision, 'deny', `${method} ${path}`);
    assert.equal(response.reasonCode, 'resource_unknown', `${method} ${path}`);
  }

  for (const request of [
    { ...normal, method: 'GET', path: '/api/notes/note-a/export',
      route: 'GET /api/notes/:id/export', queryLength: 0 },
    { ...normal, method: 'GET', path: '/api/notes/note-a/',
      route: 'GET /api/notes/:id', queryLength: 0 }
  ]) {
    const response = await decide(request);
    assert.equal(response.decision, 'deny');
    assert.equal(response.reasonCode, 'resource_unknown');
  }
});
test('announcement reads are allowed and announcement writes are denied by resource zone', async () => {
  const { normal } = fixtureRequests();

  const read = await decide({
    ...normal,
    service: 'announcements',
    method: 'GET',
    path: '/api/announcements/notice-a',
    route: 'GET /api/announcements/:id',
    queryLength: 0
  });

  assert.equal(read.decision, 'allow');
  assert.equal(read.reasonCode, 'approved');

  for (const method of ['PUT', 'POST', 'PATCH', 'DELETE']) {
    const response = await decide({
      ...normal,
      service: 'announcements',
      method,
      path: '/api/announcements/notice-a',
      route: `${method} /api/announcements/:id`,
      queryLength: 0
    });

    assert.equal(response.decision, 'deny', method);
    assert.equal(response.reasonCode, 'resource_forbidden', method);
    assert.deepEqual(response.ruleIds, ['resource_zone'], method);
  }
});

test('announcement collection writes are denied by the resource zone', async () => {
  const { normal } = fixtureRequests();

  for (const prefix of ['', '/api']) {
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
      const response = await decide({
        ...normal,
        service: 'announcements',
        method,
        path: `${prefix}/announcements`,
        route: `${method} ${prefix}/announcements`,
        queryLength: 0
      });

      assert.equal(response.decision, 'deny', `${method} ${prefix}/announcements`);
      assert.equal(response.reasonCode, 'resource_forbidden');
      assert.deepEqual(response.ruleIds, ['resource_zone']);
    }
  }
});
