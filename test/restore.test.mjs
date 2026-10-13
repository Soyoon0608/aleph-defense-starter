import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  contentDigest,
  handleRestore,
  noteBindingDigest
} from '../src/restore-api.mjs';
import config from '../aleph.config.json' with { type: 'json' };
import safeManifest from '../backups/manifest.safe.json' with { type: 'json' };

function response() {
  return {
    headers: {},
    setHeader(name, value) {
      this.headers[name] = value;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    }
  };
}

function fakeCreateClient(liveRows, backupRows) {
  return () => ({
    from(table) {
      if (table === 'byteback_notes_backup') {
        const filters = [];

        return {
          select() {
            return this;
          },
          eq(field, value) {
            filters.push([field, value]);
            return this;
          },
          async limit(count) {
            return {
              data: backupRows
                .filter((row) => filters.every(
                  ([field, value]) => row[field] === value
                ))
                .slice(0, count),
              error: null
            };
          }
        };
      }

      if (table === 'byteback_notes') {
        let restored = null;

        return {
          upsert(values) {
            const index = liveRows.findIndex(
              (row) => row.id === values.id
            );

            if (index === -1) {
              liveRows.push({ ...values });
              restored = liveRows.at(-1);
            } else {
              liveRows[index] = {
                ...liveRows[index],
                ...values
              };
              restored = liveRows[index];
            }

            return this;
          },
          select() {
            return this;
          },
          async maybeSingle() {
            return {
              data: restored ? { ...restored } : null,
              error: null
            };
          }
        };
      }

      throw new Error(`unexpected_table:${table}`);
    }
  });
}

async function callRestore({
  liveRows,
  backupRows,
  identity = 'b',
  body,
  loadPolicyBackup,
  loadBackupManifest
}) {
  const res = response();

  const fixtureManifest = backupRows.length === 1
    ? {
        ...safeManifest,
        noteBindingSha256: noteBindingDigest(
          backupRows[0].id,
          backupRows[0].owner_id,
          backupRows[0].content_sha256
        )
      }
    : safeManifest;

  await handleRestore({
    method: 'POST',
    headers: {},
    body
  }, res, {
    supabaseUrl: new URL(config.identityProvider.issuer).origin,
    verifyLogin: async () => ({
      kind: 'judge',
      userId: 'judge-fixture',
      identity
    }),
    createClient: fakeCreateClient(liveRows, backupRows),
    ...(loadPolicyBackup ? { loadPolicyBackup } : {}),
    loadBackupManifest:
      loadBackupManifest
      ?? (async () => fixtureManifest)
  });

  return res;
}

function backupRow() {
  const content = 'Original B body';

  return {
    id: '00000000-0000-4000-8000-00000000000b',
    owner_id: '00000000-0000-4000-8000-0000000000b0',
    title: 'B test note',
    content,
    content_sha256: contentDigest(content),
    sample_marker: config.sampleMarker
  };
}

test('restores one modified B note from the verified backup', async () => {
  const backup = backupRow();

  const liveRows = [
    {
      id: backup.id,
      owner_id: 'b',
      title: 'tampered',
      content: 'tampered'
    },
    {
      id: '00000000-0000-4000-8000-00000000000a',
      owner_id: 'a',
      title: 'A note',
      content: 'A stays unchanged'
    }
  ];

  const res = await callRestore({
    liveRows,
    backupRows: [backup],
    body: { id: backup.id }
  });

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.restored, true);

  const restored = liveRows.find((row) => row.id === backup.id);

  assert.equal(restored.owner_id, backup.owner_id);
  assert.equal(restored.title, backup.title);
  assert.equal(restored.content, backup.content);
  assert.equal(
    contentDigest(restored.content),
    backup.content_sha256
  );

  const aNote = liveRows.find((row) => row.owner_id === 'a');
  assert.equal(aNote.content, 'A stays unchanged');
});

test('restores a deleted B note without changing another note', async () => {
  const backup = backupRow();

  const liveRows = [{
    id: '00000000-0000-4000-8000-00000000000a',
    owner_id: 'a',
    title: 'A note',
    content: 'A stays unchanged'
  }];

  const res = await callRestore({
    liveRows,
    backupRows: [backup]
  });

  assert.equal(res.statusCode, 200);

  const restored = liveRows.find((row) => row.id === backup.id);

  assert.ok(restored);
  assert.equal(restored.owner_id, backup.owner_id);
  assert.equal(restored.content, backup.content);
  assert.equal(liveRows.length, 2);
  assert.equal(
    liveRows.find((row) => row.owner_id === 'a').content,
    'A stays unchanged'
  );
});

test('rejects a tampered backup hash', async () => {
  const backup = backupRow();
  backup.content = 'changed after backup';

  const liveRows = [];

  const res = await callRestore({
    liveRows,
    backupRows: [backup],
    body: { id: backup.id }
  });

  assert.equal(res.statusCode, 409);
  assert.equal(liveRows.length, 0);
});

test('only judge identity B may use the restore route', async () => {
  const backup = backupRow();
  const liveRows = [];

  const res = await callRestore({
    liveRows,
    backupRows: [backup],
    identity: 'a',
    body: { id: backup.id }
  });

  assert.equal(res.statusCode, 403);
  assert.equal(liveRows.length, 0);
});

test('stops before restore when the policy backup cannot be verified', async () => {
  const backup = backupRow();

  const liveRows = [{
    id: backup.id,
    owner_id: backup.owner_id,
    title: 'Modified B note',
    content: 'Modified B body'
  }];

  const before = structuredClone(liveRows);

  const res = await callRestore({
    liveRows,
    backupRows: [backup],
    body: { id: backup.id },
    loadPolicyBackup: async () => {
      throw new Error('fixture_policy_backup_unverified');
    }
  });

  assert.equal(res.statusCode, 409);
  assert.deepEqual(liveRows, before);
});

test('stops before restore when the independent note binding differs', async () => {
  const backup = backupRow();

  const liveRows = [{
    id: backup.id,
    owner_id: backup.owner_id,
    title: 'Modified B note',
    content: 'Modified B body'
  }];

  const before = structuredClone(liveRows);

  const res = await callRestore({
    liveRows,
    backupRows: [backup],
    body: { id: backup.id },
    loadBackupManifest: async () => ({
      ...safeManifest,
      noteBindingSha256: '0'.repeat(64)
    })
  });

  assert.equal(res.statusCode, 409);
  assert.deepEqual(liveRows, before);
});
