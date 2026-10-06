// Requires initdb, pg_ctl and psql on PATH. Creates an isolated temporary cluster.
import { execFileSync, spawn } from 'node:child_process';
import { mkdtemp, readFile, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { createServer } from 'node:net';
const root = fileURLToPath(new URL('../../', import.meta.url));
const dir = await mkdtemp(path.join(tmpdir(), 'aegitasks-pg-'));
const artifact = path.join(root, 'artifacts');
await mkdir(artifact, { recursive: true });
const run = (exe, args, input) =>
  execFileSync(exe, args, {
    cwd: root,
    windowsHide: true,
    encoding: 'utf8',
    input,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
// Let Windows select an available port outside reserved Hyper-V/WSL ranges.
const reservation = createServer();
await new Promise((resolve, reject) => {
  reservation.once('error', reject);
  reservation.listen(0, '127.0.0.1', resolve);
});
const port = String(reservation.address().port);
await new Promise((resolve, reject) =>
  reservation.close((error) => (error ? reject(error) : resolve())),
);
const sql = (database, text) =>
  run(
    'psql',
    [
      '-X',
      '-h',
      '127.0.0.1',
      '-p',
      port,
      '-U',
      'aegitest',
      '-d',
      database,
      '-v',
      'ON_ERROR_STOP=1',
      '-t',
      '-A',
    ],
    text,
  );
let started = false;
try {
  run('dotnet', [
    'ef',
    'migrations',
    'script',
    '0',
    'InitialCreate',
    '--project',
    'server/AegiTasks.Api',
    '--output',
    path.join(artifact, 'migration-initial.sql'),
  ]);
  run('dotnet', [
    'ef',
    'migrations',
    'script',
    'InitialCreate',
    'SpacesNotesFocusRoles',
    '--project',
    'server/AegiTasks.Api',
    '--output',
    path.join(artifact, 'migration-spaces.sql'),
  ]);
  run('initdb', [
    '-D',
    path.join(dir, 'data'),
    '-U',
    'aegitest',
    '--auth=trust',
    '--encoding=UTF8',
    '--locale=C',
  ]);
  execFileSync(
    'pg_ctl',
    [
      '-D',
      path.join(dir, 'data'),
      '-l',
      path.join(dir, 'server.log'),
      '-o',
      `-p ${port} -h 127.0.0.1`,
      '-w',
      'start',
    ],
    { windowsHide: true, stdio: 'ignore' },
  );
  started = true;
  sql('postgres', 'CREATE DATABASE legacy; CREATE DATABASE fresh;');
  sql('legacy', await readFile(path.join(artifact, 'migration-initial.sql'), 'utf8'));
  sql(
    'legacy',
    `
    INSERT INTO "Users" VALUES ('20000000-0000-4000-8000-000000000001','old-admin@example.com','Old admin','test-fixture-hash','Admin',true,0),
    ('20000000-0000-4000-8000-000000000002','old-user@example.com','Old user','test-fixture-hash','Member',true,0);
    INSERT INTO "Projects" VALUES ('30000000-0000-4000-8000-000000000001','Existing PMS','Keep me','purple',false);
    INSERT INTO "Tags" VALUES ('40000000-0000-4000-8000-000000000001','CUSTOM','green');
    INSERT INTO "Statuses" VALUES ('50000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','Open','blue',0,false);
    INSERT INTO "Tasks" VALUES ('60000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001',NULL,'50000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000002',NULL,'Existing bug','Preserve its history',NULL,NULL,NULL,false,now(),now(),'60000000-0000-4000-8000-000000000002');
    INSERT INTO "Activities" VALUES ('70000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000002','comment','Previous comment',now());
    INSERT INTO "WorkItemTags" VALUES ('40000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000001');
  `,
  );
  sql('legacy', await readFile(path.join(artifact, 'migration-spaces.sql'), 'utf8'));
  run('dotnet', [
    'ef',
    'migrations',
    'script',
    'SpacesNotesFocusRoles',
    'ProjectLabels',
    '--project',
    'server/AegiTasks.Api',
    '--output',
    path.join(artifact, 'migration-labels.sql'),
  ]);
  sql('legacy', await readFile(path.join(artifact, 'migration-labels.sql'), 'utf8'));
  sql(
    'legacy',
    `INSERT INTO "FocusProfiles" ("UserId", "FocusMinutes", "ShortBreakMinutes", "LongBreakMinutes", "Cycles", "Theme", "Animated", "Sound") VALUES ('20000000-0000-4000-8000-000000000001', 45, 7, 20, 3, 'waves', false, true);`,
  );
  run('dotnet', [
    'ef',
    'migrations',
    'script',
    'ProjectLabels',
    'FocusVisuals',
    '--project',
    'server/AegiTasks.Api',
    '--output',
    path.join(artifact, 'migration-focus-visuals.sql'),
  ]);
  sql('legacy', await readFile(path.join(artifact, 'migration-focus-visuals.sql'), 'utf8'));
  sql(
    'legacy',
    `
    INSERT INTO "Users" ("Id", "Email", "Name", "PasswordHash", "Role", "Active", "SessionVersion") VALUES
    ('20000000-0000-4000-8000-000000000003', 'same@one.example', 'Same visible name', 'retained-hash-1', 'User', true, 0),
    ('20000000-0000-4000-8000-000000000004', 'same@two.example', 'Same visible name', 'retained-hash-2', 'User', true, 0),
    ('20000000-0000-4000-8000-000000000005', 'a@short.example', 'Same visible name', 'retained-hash-3', 'User', true, 0);
  `,
  );
  run('dotnet', [
    'ef',
    'migrations',
    'script',
    'FocusVisuals',
    'Usernames',
    '--project',
    'server/AegiTasks.Api',
    '--output',
    path.join(artifact, 'migration-usernames.sql'),
  ]);
  sql('legacy', await readFile(path.join(artifact, 'migration-usernames.sql'), 'utf8'));
  sql('legacy', 'UPDATE "Tasks" SET "EstimateMinutes" = 90;');
  run('dotnet', [
    'ef',
    'migrations',
    'script',
    'Usernames',
    'ProjectPlanning',
    '--project',
    'server/AegiTasks.Api',
    '--output',
    path.join(artifact, 'migration-planning.sql'),
  ]);
  sql('legacy', await readFile(path.join(artifact, 'migration-planning.sql'), 'utf8'));
  assert.equal(
    sql('legacy', 'SELECT "EstimateKind" || \':\' || "EstimateMinutes" FROM "Tasks";').trim(),
    'time:90',
  );
  assert.equal(sql('legacy', 'SELECT "EstimateScheme" FROM "Projects";').trim(), 'time');
  assert.equal(sql('legacy', 'SELECT count(*) FROM "Modules";').trim(), '0');
  assert.equal(sql('legacy', 'SELECT count(*) FROM "Cycles";').trim(), '0');
  console.log(
    'PASS PostgreSQL planning upgrade preserves existing time estimates, task identities and history; optional groups start empty',
  );
  assert.equal(sql('legacy', 'SELECT count(DISTINCT "Username") FROM "Users";').trim(), '5');
  assert.equal(
    sql('legacy', 'SELECT "Username" FROM "Users" WHERE "Email" = \'same@one.example\';').trim(),
    'same',
  );
  assert.equal(
    sql('legacy', 'SELECT "Username" FROM "Users" WHERE "Email" = \'same@two.example\';').trim(),
    'same-2',
  );
  assert.equal(
    sql('legacy', 'SELECT "Username" FROM "Users" WHERE "Email" = \'a@short.example\';').trim(),
    'user',
  );
  assert.equal(
    sql(
      'legacy',
      'SELECT "PasswordHash" FROM "Users" WHERE "Email" = \'same@two.example\';',
    ).trim(),
    'retained-hash-2',
  );
  console.log(
    'PASS PostgreSQL username migration backfills unique handles with duplicate display names and email prefixes, preserving password hashes',
  );
  assert.equal(
    sql(
      'legacy',
      `SELECT "Theme" || ':' || "FocusMinutes" || ':' || "AccentColor" || ':' || "ParticleShape" FROM "FocusProfiles";`,
    ).trim(),
    'waves:45:#A78BFA:mixed',
  );
  assert.equal(sql('legacy', 'SELECT count(*) FROM "Projects" WHERE "Labels" = \'\';').trim(), '1');
  assert.equal(sql('legacy', 'SELECT "Name" FROM "Statuses";').trim(), 'Open');
  assert.equal(sql('legacy', 'SELECT count(*) FROM "Spaces" WHERE "IsPersonal";').trim(), '2');
  assert.equal(sql('legacy', 'SELECT count(*) FROM "SpaceMembers";').trim(), '2');
  assert.equal(
    sql(
      'legacy',
      `SELECT "Role" || ':' || "SessionVersion" FROM "Users" WHERE "Email"='old-user@example.com';`,
    ).trim(),
    'User:1',
  );
  assert.equal(
    sql(
      'legacy',
      `SELECT p."Name" || ':' || s."Name" FROM "Projects" p JOIN "Spaces" s ON p."SpaceId"=s."Id";`,
    ).trim(),
    'Existing PMS:Equipo existente',
  );
  assert.equal(sql('legacy', 'SELECT count(*) FROM "Tags";').trim(), '7');
  assert.equal(sql('legacy', 'SELECT "Title" FROM "Tasks";').trim(), 'Existing bug');
  assert.equal(sql('legacy', 'SELECT "Body" FROM "Activities";').trim(), 'Previous comment');
  assert.equal(sql('legacy', 'SELECT count(*) FROM "WorkItemTags";').trim(), '1');
  assert.equal(
    sql('legacy', 'SELECT count(*) FROM "PagePermissions" WHERE "Allowed";').trim(),
    '12',
  );
  console.log(
    'PASS PostgreSQL upgrade preserves the legacy team, projects and tags and creates personal spaces',
  );
  await writeFile(
    path.join(artifact, 'postgres-migration-results.json'),
    JSON.stringify(
      {
        version: run('psql', ['--version']).trim(),
        legacyUpgrade: true,
        personalSpaces: 2,
        retainedMemberships: 2,
        retainedCustomTags: true,
        retainedFocusPreferences: true,
        uniqueUsernames: true,
        retainedPasswordHashes: true,
        retainedTaskEstimates: true,
        testedAt: new Date().toISOString(),
      },
      null,
      2,
    ),
  );
  const child = spawn(process.execPath, [path.join(root, 'client/scripts/e2e.mjs')], {
    cwd: root,
    windowsHide: true,
    stdio: 'inherit',
    env: {
      ...process.env,
      AEGITASKS_TEST_POSTGRES: `Host=127.0.0.1;Port=${port};Database=fresh;Username=aegitest`,
    },
  });
  const code = await new Promise((resolve) => child.on('exit', resolve));
  assert.equal(code, 0, 'PostgreSQL end-to-end suite must pass');
  await writeFile(
    path.join(artifact, 'postgres-test-results.json'),
    await readFile(path.join(artifact, 'test-results.json')),
  );
} finally {
  if (started) run('pg_ctl', ['-D', path.join(dir, 'data'), '-m', 'fast', '-w', 'stop']);
  console.log(`Isolated PostgreSQL test data retained: ${dir}`);
}
