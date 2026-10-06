// Exercises the local EnsureCreated upgrade path on an isolated database with existing accounts.
import { DatabaseSync } from 'node:sqlite';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const root = fileURLToPath(new URL('../../', import.meta.url));
const dir = await mkdtemp(path.join(tmpdir(), 'aegitasks-sqlite-upgrade-'));
const database = path.join(dir, 'upgrade.db');
const password = 'Upgrade-fixture-only-2026!';
let service;
let log = '';
async function start() {
  service = spawn(
    'dotnet',
    [
      path.join(root, 'server/AegiTasks.Api/bin/Debug/net10.0/AegiTasks.Api.dll'),
      '--urls',
      'http://localhost:5215',
    ],
    {
      cwd: root,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        ASPNETCORE_ENVIRONMENT: 'Development',
        DatabaseProvider: 'Sqlite',
        ConnectionStrings__Default: `Data Source=${database}`,
        StoragePath: path.join(dir, 'uploads'),
        DataProtectionPath: path.join(dir, 'keys'),
        SEED_ADMIN_EMAIL: 'admin@example.com',
        SEED_ADMIN_PASSWORD: password,
      },
    },
  );
  service.stdout.on('data', (b) => {
    log += b.toString();
  });
  service.stderr.on('data', (b) => {
    log += b.toString();
  });
  for (let attempt = 0; attempt < 90; attempt++) {
    if (service.exitCode != null) throw new Error(log);
    try {
      if ((await fetch('http://localhost:5215/api/health')).ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(log);
}
async function stop() {
  if (!service || service.exitCode != null || service.signalCode != null) return;
  const exited = new Promise((resolve) => service.once('exit', resolve));
  service.kill();
  await exited;
  service = null;
}
let cookie = '';
async function api(endpoint, method = 'GET', data) {
  const response = await fetch(`http://localhost:5215/api${endpoint}`, {
    method,
    headers: {
      'X-AegiTasks': '1',
      'Content-Type': 'application/json',
      ...(cookie ? { Cookie: cookie } : {}),
    },
    ...(data ? { body: JSON.stringify(data) } : {}),
  });
  assert.equal(response.status, 200, `${endpoint}: ${await response.clone().text()}`);
  if (response.headers.has('set-cookie')) cookie = response.headers.get('set-cookie').split(';')[0];
  return response.json();
}
try {
  await start();
  const user = await api('/auth/login', 'POST', { email: 'admin@example.com', password });
  const personal = (await api('/spaces')).spaces.find((s) => s.isPersonal);
  const note = await api('/notes', 'POST', {
    title: 'Keep this note',
    markdown: '# Existing content',
    color: 'purple',
    font: 'sans',
    pinned: false,
    archived: false,
  });
  const project = await api('/projects', 'POST', { name: 'Existing project', color: 'purple' });
  const workspace = await api('/workspace');
  const status = workspace.statuses.find((s) => s.projectId === project.id);
  const task = await api('/tasks', 'POST', {
    title: 'Existing timed task',
    projectId: project.id,
    statusId: status.id,
    estimateMinutes: 90,
    tagIds: [],
  });
  await stop();
  const db = new DatabaseSync(database);
  const original = db.prepare('SELECT * FROM Users WHERE Email = ?').get(user.email);
  // Simulate the previous local schema and a collision in the email prefix.
  db.exec('DROP INDEX IX_Users_Username; ALTER TABLE Users DROP COLUMN Username;');
  db.exec(`
    PRAGMA foreign_keys = OFF;
    BEGIN;
    CREATE TABLE Tasks_old (
      Id TEXT NOT NULL PRIMARY KEY, ProjectId TEXT NOT NULL, FolderId TEXT NULL, StatusId TEXT NOT NULL,
      CreatedById TEXT NOT NULL, AssigneeId TEXT NULL, Title TEXT NOT NULL, Description TEXT NOT NULL,
      Priority INTEGER NULL, DueDate TEXT NULL, EstimateMinutes INTEGER NULL, Archived INTEGER NOT NULL,
      CreatedAt TEXT NOT NULL, UpdatedAt TEXT NOT NULL, Version TEXT NOT NULL,
      FOREIGN KEY (ProjectId) REFERENCES Projects (Id) ON DELETE RESTRICT,
      FOREIGN KEY (FolderId, ProjectId) REFERENCES Folders (Id, ProjectId) ON DELETE RESTRICT,
      FOREIGN KEY (StatusId, ProjectId) REFERENCES Statuses (Id, ProjectId) ON DELETE RESTRICT,
      FOREIGN KEY (CreatedById) REFERENCES Users (Id) ON DELETE RESTRICT,
      FOREIGN KEY (AssigneeId) REFERENCES Users (Id) ON DELETE RESTRICT
    );
    INSERT INTO Tasks_old SELECT Id, ProjectId, FolderId, StatusId, CreatedById, AssigneeId, Title, Description, Priority, DueDate, EstimateMinutes, Archived, CreatedAt, UpdatedAt, Version FROM Tasks;
    DROP TABLE Tasks; ALTER TABLE Tasks_old RENAME TO Tasks;
    DROP TABLE Modules; DROP TABLE Cycles;
    ALTER TABLE Projects DROP COLUMN EstimateScheme;
    COMMIT;
    PRAGMA foreign_keys = ON;
  `);
  db.prepare(
    'INSERT INTO Users (Id, Email, Name, PasswordHash, Role, Active, SessionVersion) VALUES (?, ?, ?, ?, ?, ?, ?)',
  ).run(
    randomUUID().toUpperCase(),
    'admin@another.example',
    original.Name,
    original.PasswordHash,
    'User',
    1,
    0,
  );
  db.close();
  cookie = '';
  await start();
  const upgraded = await api('/auth/login', 'POST', { email: user.email, password });
  assert.equal(upgraded.id, user.id);
  assert.equal(upgraded.username, 'admin-2');
  assert.equal((await api('/spaces')).spaces.find((s) => s.isPersonal).id, personal.id);
  assert.equal((await api(`/notes/${note.id}`)).markdown, note.markdown);
  const existingTask = (await api(`/tasks/${task.id}`)).item;
  assert.equal(existingTask.estimateMinutes, 90);
  assert.equal(existingTask.estimateKind, 'time');
  assert.equal(existingTask.moduleId, null);
  assert.equal(existingTask.cycleId, null);
  assert.equal(existingTask.parentTaskId, null);
  const module = await api('/modules', 'POST', { projectId: project.id, name: 'Upgraded module' });
  const cycle = await api('/cycles', 'POST', { projectId: project.id, name: 'Upgraded cycle' });
  const assigned = await api(`/tasks/${task.id}`, 'PUT', {
    ...existingTask,
    tagIds: [],
    planning: { moduleId: module.id, cycleId: cycle.id, estimateKind: 'time' },
  });
  assert.equal(assigned.moduleId, module.id);
  assert.equal(assigned.estimateMinutes, 90);
  assert.equal((await api(`/projects/${project.id}/planning`)).project.total, 1);
  const child = await api('/tasks', 'POST', {
    ...existingTask,
    title: 'Child after local upgrade',
    tagIds: [],
    hierarchy: { parentTaskId: existingTask.id },
  });
  assert.equal(child.parentTaskId, existingTask.id);
  assert.equal((await api(`/tasks/${existingTask.id}`)).children.total, 1);
  assert.equal((await api('/auth/login', 'POST', { identifier: 'ADMIN-2', password })).id, user.id);
  assert.equal(
    (await api('/auth/login', 'POST', { identifier: 'admin', password })).email,
    'admin@another.example',
  );
  await stop();
  const verify = new DatabaseSync(database);
  assert.equal(
    verify.prepare('SELECT PasswordHash FROM Users WHERE Email = ?').get(user.email).PasswordHash,
    original.PasswordHash,
  );
  assert.throws(() =>
    verify.prepare('UPDATE Users SET Username = ? WHERE Email = ?').run('admin', user.email),
  );
  verify.close();
  await mkdir(path.join(root, 'artifacts'), { recursive: true });
  await writeFile(
    path.join(root, 'artifacts/sqlite-upgrade-results.json'),
    JSON.stringify(
      {
        uniqueUsernames: true,
        preservedPasswordHashes: true,
        preservedPersonalSpace: true,
        preservedNotes: true,
        usernameLogin: true,
        retainedTaskEstimates: true,
        newPlanningWorks: true,
        hierarchyWorks: true,
        testedAt: new Date().toISOString(),
      },
      null,
      2,
    ),
  );
  console.log(
    'PASS Existing SQLite upgrade preserves account identities, password hashes, personal space and notes; backfills unique usernames and supports both logins',
  );
} finally {
  await stop();
  console.log(`Isolated SQLite upgrade data retained: ${dir}`);
}
