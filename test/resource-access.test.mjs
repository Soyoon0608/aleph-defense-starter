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
    async maybeSingle() {
      const row = rows.find(item => filters.every(([field, value]) =>
        (ignoreOwnerFilter && field === 'owner_id') || item[field] === value));
      if (!row) return { data: null, error: null };
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

async function callNotesApi({ rows, userId, method, body, single = true, ignoreOwnerFilter = false }) {
  const response = fakeResponse();
  await handleNotes({
    method,
    headers: {},
    query: single ? { id: '00000000-0000-4000-8000-000000000001' } : {},
    body
  }, response, single, {
    supabaseUrl: new URL(config.identityProvider.issuer).origin,
    verifyLogin: async () => ({ userId }),
    createClient: () => fakeNotesClient(rows, ignoreOwnerFilter)
  });
  return response;
}

test('allows an identified student note read and update on a registered device', async () => {
  const normal = fixtureRequests().normal;
  for (const [method, expectedOperation] of [['GET', 'read'], ['PUT', 'update']]) {
    const request = {
      ...normal,
      method,
      path: '/notes/note-a',
      route: `${method} /notes/:id`
    };
    const resource = identifyResource(request);
    const response = await decide(request);
    assert.equal(resource?.operation, expectedOperation);
    assert.equal(response.decision, 'allow');
    assert.equal(response.reasonCode, 'approved');
    assert.ok(RULE_IDS.includes('resource_zone'));
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
    'student_announcement_update',
    'unknown_resource_path'
  ]);
});

test('denies student announcement updates and unknown resource paths', async () => {
  const normal = fixtureRequests().normal;
  const announcementUpdate = await decide({
    ...normal,
    service: 'announcements',
    method: 'PUT',
    path: '/announcements/notice-a',
    route: 'PUT /announcements/:id'
  });
  assert.equal(announcementUpdate.decision, 'deny');
  assert.equal(announcementUpdate.reasonCode, 'resource_forbidden');

  const unknownPath = await decide({
    ...normal,
    method: 'GET',
    path: '/notes/note-a/export',
    route: 'GET /notes/:id/export'
  });
  assert.equal(unknownPath.decision, 'deny');
  assert.equal(unknownPath.reasonCode, 'resource_unknown');
});