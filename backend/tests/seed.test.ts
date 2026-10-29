import { count, eq } from 'drizzle-orm';
import { afterEach, describe, expect, it } from 'vitest';
import { TEST_ONLY_CREDENTIALS, USER_IDS, fixtureSessions } from '@mumtaz/contracts/fixtures';
import { ensureBootstrapAdmin } from '../src/db/bootstrap-admin.js';
import type { DatabaseHandle } from '../src/db/client.js';
import { lessonSessions, users } from '../src/db/schema.js';
import { seedSyntheticData } from '../src/db/seed.js';
import { safeErrorMessage } from '../src/lib/db-errors.js';
import { createTestDatabase } from './helpers/test-db.js';
import { testEnvSource } from './test-env.js';

const options = {
  adminPassword: TEST_ONLY_CREDENTIALS.adminPassword,
  tutorPassword: TEST_ONLY_CREDENTIALS.tutorPassword,
  parentAccessCodePepper: testEnvSource.PARENT_ACCESS_CODE_PEPPER,
};

let handle: DatabaseHandle | undefined;
afterEach(async () => {
  await handle?.close();
  handle = undefined;
});

describe('seed sintetis & bootstrap admin', () => {
  it('idempoten: dijalankan dua kali tidak menduplikasi data', async () => {
    handle = await createTestDatabase();
    await seedSyntheticData(handle.db, options);
    await seedSyntheticData(handle.db, options);
    const [sessions] = await handle.db.select({ n: count() }).from(lessonSessions);
    expect(sessions?.n).toBe(fixtureSessions.length);
  });

  it('tetap jalan bila admin sudah dibuat lebih dulu oleh bootstrap (ID acak)', async () => {
    handle = await createTestDatabase();
    expect(await ensureBootstrapAdmin(handle.db, { username: 'admin.demo', password: 'admin-password-panjang' })).toBe('created');
    await seedSyntheticData(handle.db, options);

    const [admin] = await handle.db.select().from(users).where(eq(users.username, 'admin.demo'));
    expect(admin?.id).not.toBe(USER_IDS.admin);
    const reviewed = await handle.db.select().from(lessonSessions).where(eq(lessonSessions.status, 'approved'));
    expect(reviewed.every((row) => row.reviewed_by_user_id === admin?.id)).toBe(true);
  });

  it('bootstrap tidak menimpa password admin yang sudah ada dan menolak password pendek', async () => {
    handle = await createTestDatabase();
    await ensureBootstrapAdmin(handle.db, { username: 'admin.demo', password: 'admin-password-panjang' });
    const [before] = await handle.db.select().from(users).where(eq(users.username, 'admin.demo'));
    expect(await ensureBootstrapAdmin(handle.db, { username: 'admin.demo', password: 'password-lain-yang-panjang' })).toBe('exists');
    const [after] = await handle.db.select().from(users).where(eq(users.username, 'admin.demo'));
    expect(after?.password_hash).toBe(before?.password_hash);
    await expect(ensureBootstrapAdmin(handle.db, { username: 'admin.lain', password: 'pendek' })).rejects.toThrow(/minimal 12/);
  });
});

describe('safeErrorMessage', () => {
  it('error query tidak membocorkan parameter (hash/kode akses)', async () => {
    handle = await createTestDatabase();
    const secretHash = '$argon2id$v=19$m=19456,t=2,p=1$RAHASIA';
    const error = await handle.db
      .insert(users)
      .values({ full_name: 'X', username: 'x.user', password_hash: secretHash, role: 'bukan-role' })
      .then(() => undefined, (e: unknown) => e);

    const message = safeErrorMessage(error);
    expect(message).toMatch(/^PostgreSQL 23514 \[users_role_check\]/);
    expect(message).not.toContain('RAHASIA');
    expect(message).not.toContain('Failed query');
  });
});
