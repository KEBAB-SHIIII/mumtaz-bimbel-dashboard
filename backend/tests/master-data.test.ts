import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  parentAccessCodeIssuedSchema,
  parentSchema,
  paginatedSchema,
  studentSchema,
  subjectSchema,
  tutorCredentialIssuedSchema,
  tutorSchema,
} from '@mumtaz/contracts';
import { STUDENT_IDS, TUTOR_IDS, USER_IDS } from '@mumtaz/contracts/fixtures';
import { TestClient, as, createTestApp, type TestApp } from './helpers/test-app.js';

let t: TestApp;
let admin: TestClient;

beforeAll(async () => {
  t = await createTestApp();
  admin = await as.admin(t.app);
});
afterAll(() => t.close());

describe('Master Data → Tutor', () => {
  it('list terpaginasi sesuai kontrak (default page_size 20)', async () => {
    const res = await admin.get('/admin/tutors').expect(200);
    const body = paginatedSchema(tutorSchema).parse(res.body);
    expect(body).toMatchObject({ page: 1, page_size: 20, total: 6 });
    expect(JSON.stringify(res.body)).not.toMatch(/password|hash/i);
  });

  it('create: password acak dibuat sistem, tampil sekali (no-store), tidak ada di GET, tutor bisa login', async () => {
    const res = await admin.post('/admin/tutors', { full_name: 'Dewi', username: 'dewi', phone: '080000000003' });
    expect(res.status).toBe(201);
    expect(res.headers['cache-control']).toBe('no-store');
    const issued = tutorCredentialIssuedSchema.parse(res.body);
    expect(issued.tutor).toMatchObject({ full_name: 'Dewi', is_active: true, login_active: true });
    expect(issued.temporary_password).toMatch(/^[A-Za-z2-9]{4}-[A-Za-z2-9]{4}-[A-Za-z2-9]{4}$/);

    const detail = await admin.get(`/admin/tutors/${issued.tutor.id}`).expect(200);
    expect(JSON.stringify(detail.body)).not.toContain(issued.temporary_password);
    expect(JSON.stringify(detail.body)).not.toMatch(/password/i);
    await new TestClient(t.app).login('dewi', issued.temporary_password);
  });

  it('password sementara berbeda untuk tiap tutor; initial_password dari Admin ditolak (422)', async () => {
    const a = tutorCredentialIssuedSchema.parse((await admin.post('/admin/tutors', { full_name: 'Tutor Satu', username: 'tutor.satu' }).expect(201)).body);
    const b = tutorCredentialIssuedSchema.parse((await admin.post('/admin/tutors', { full_name: 'Tutor Dua', username: 'tutor.dua' }).expect(201)).body);
    expect(a.temporary_password).not.toBe(b.temporary_password);
    const manual = await admin.post('/admin/tutors', { full_name: 'Manual', username: 'manual', initial_password: 'password-manual-123' });
    expect(manual.status).toBe(422);
  });

  it('reset password: password lama & session aktif dicabut, password baru bisa login, tutor mengganti sendiri', async () => {
    const created = tutorCredentialIssuedSchema.parse(
      (await admin.post('/admin/tutors', { full_name: 'Lupa Password', username: 'lupa.password' }).expect(201)).body,
    );
    const session = await new TestClient(t.app).login('lupa.password', created.temporary_password);
    await session.get('/auth/me').expect(200);

    const res = await admin.post(`/admin/tutors/${created.tutor.id}/reset-password`);
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    const reset = tutorCredentialIssuedSchema.parse(res.body);
    expect(reset.temporary_password).not.toBe(created.temporary_password);

    await session.get('/auth/me').expect(401);
    const oldLogin = await (await new TestClient(t.app).init()).post('/auth/login', { username: 'lupa.password', password: created.temporary_password });
    expect(oldLogin.status).toBe(401);

    const fresh = await new TestClient(t.app).login('lupa.password', reset.temporary_password);
    await fresh.patch('/tutor/me/password', { current_password: reset.temporary_password, new_password: 'password-baru-pilihan-tutor' }).expect(200);
    await new TestClient(t.app).login('lupa.password', 'password-baru-pilihan-tutor');
  });

  it('reset password hanya untuk Admin; tutor tidak ada → 404', async () => {
    const tutorA = await as.tutorA(t.app);
    expect((await tutorA.post(`/admin/tutors/${TUTOR_IDS.tutorB}/reset-password`)).status).toBe(403);
    expect((await admin.post('/admin/tutors/00000000-0000-4000-8fff-000000000001/reset-password')).status).toBe(404);
  });

  it('username duplikat → 409 CONFLICT dengan pesan aman', async () => {
    const res = await admin.post('/admin/tutors', { full_name: 'Duplikat', username: 'farhan' });
    expect(res.status).toBe(409);
    expect(res.body.error).toMatchObject({ code: 'CONFLICT', details: [{ field: 'username' }] });
    expect(JSON.stringify(res.body)).not.toMatch(/users_username_key|duplicate key/);
  });

  it('login_active=false mencabut session tutor yang sedang aktif', async () => {
    const tutorB = await as.tutorB(t.app);
    await tutorB.get('/auth/me').expect(200);

    const res = await admin.patch(`/admin/tutors/${TUTOR_IDS.tutorB}`, { login_active: false });
    expect(tutorSchema.parse(res.body).login_active).toBe(false);
    await tutorB.get('/auth/me').expect(401);

    await admin.patch(`/admin/tutors/${TUTOR_IDS.tutorB}`, { login_active: true }).expect(200);
  });

  it('field tak dikenal ditolak 422 (strict), ID bukan UUID → 422', async () => {
    const unknown = await admin.patch(`/admin/tutors/${TUTOR_IDS.tutorA}`, { role: 'admin' });
    expect(unknown.status).toBe(422);
    expect(unknown.body.error.details).toEqual([{ field: 'role', message: 'Field tidak dikenal' }]);
    expect((await admin.get('/admin/tutors/bukan-uuid')).status).toBe(422);
  });

  it('tidak ada hard delete (DELETE tidak tersedia)', async () => {
    const res = await admin.agent
      .delete(`/api/v1/admin/tutors/${TUTOR_IDS.tutorA}`)
      .set('Origin', 'http://localhost:5173')
      .set('X-CSRF-Token', admin.csrf);
    expect(res.status).toBe(404);
  });
});

describe('Master Data → Siswa & Mapel', () => {
  it('create/update siswa; soft deactivation', async () => {
    const created = studentSchema.parse(
      (await admin.post('/admin/students', { full_name: 'Putri', grade: '6 SD', school_name: 'SD Harapan Bangsa' }).expect(201)).body,
    );
    const updated = await admin.patch(`/admin/students/${created.id}`, { is_active: false }).expect(200);
    expect(studentSchema.parse(updated.body).is_active).toBe(false);
  });

  it('search siswa memperlakukan wildcard secara literal', async () => {
    const byName = await admin.get('/admin/students?search=aisyah').expect(200);
    expect(byName.body.items.map((s: { full_name: string }) => s.full_name)).toEqual(['Aisyah']);
    // Pencarian juga mencakup asal sekolah (Aisyah, Dimas, Hana, Lutfi, …).
    const bySchool = await admin.get('/admin/students?search=Harapan').expect(200);
    expect(bySchool.body.total).toBeGreaterThanOrEqual(4);
    const wildcard = await admin.get('/admin/students?search=%25').expect(200);
    expect(wildcard.body.total).toBe(0);
  });

  it('nama mapel unik case-insensitive → 409', async () => {
    const res = await admin.post('/admin/subjects', { name: 'matematika' });
    expect(res.status).toBe(409);
    expect(res.body.error.details[0].field).toBe('name');
    subjectSchema.parse((await admin.post('/admin/subjects', { name: 'Mengaji' }).expect(201)).body);
  });
});

describe('Master Data → Orang Tua & ID Akses', () => {
  it('create: kode mentah dikembalikan sekali, GET tidak pernah memuatnya', async () => {
    const res = await admin.post('/admin/parents', {
      full_name: 'Wali Demo C',
      email: 'wali-c@example.test',
      student_links: [{ student_id: STUDENT_IDS.murid2, relationship: 'ibu' }],
    });
    expect(res.status).toBe(201);
    expect(res.headers['cache-control']).toBe('no-store');
    const issued = parentAccessCodeIssuedSchema.parse(res.body);
    expect(issued.parent.students).toEqual([{ student_id: STUDENT_IDS.murid2, full_name: 'Bima', relationship: 'ibu' }]);

    const detail = await admin.get(`/admin/parents/${issued.parent.id}`).expect(200);
    parentSchema.parse(detail.body);
    expect(JSON.stringify(detail.body)).not.toContain(issued.access_code);
    expect(JSON.stringify(detail.body)).not.toMatch(/access_code|hash/);

    const parent = await new TestClient(t.app).loginParent(issued.access_code);
    const students = await parent.get('/parent/me/students').expect(200);
    expect(students.body.items.map((s: { id: string }) => s.id)).toEqual([STUDENT_IDS.murid2]);
  });

  it('siswa tidak ada → 422', async () => {
    const res = await admin.post('/admin/parents', {
      full_name: 'Wali X',
      student_links: [{ student_id: '00000000-0000-4000-8fff-000000000099' }],
    });
    expect(res.status).toBe(422);
  });

  it('rotate: kode lama tidak berlaku dan session parent aktif dicabut', async () => {
    const parentB = await as.parentB(t.app);
    const rotated = parentAccessCodeIssuedSchema.parse(
      (await admin.post(`/admin/parents/${USER_IDS.parentB}/rotate-access-code`).expect(200)).body,
    );

    await parentB.get('/parent/me/students').expect(401);
    const oldCode = await (await new TestClient(t.app).init()).post('/auth/parent-access', {
      access_code: 'MUMTAZ-DEMO-PARENT-B-ACCESS-ONLY',
    });
    expect(oldCode.status).toBe(401);
    await new TestClient(t.app).loginParent(rotated.access_code);
  });

  it('PATCH student_links mengganti seluruh relasi', async () => {
    const res = await admin.patch(`/admin/parents/${USER_IDS.parentA}`, {
      student_links: [
        { student_id: STUDENT_IDS.murid1, relationship: 'ayah' },
        { student_id: STUDENT_IDS.murid3, relationship: 'ayah' },
      ],
    });
    expect(parentSchema.parse(res.body).students.map((s) => s.student_id).sort()).toEqual(
      [STUDENT_IDS.murid1, STUDENT_IDS.murid3].sort(),
    );
    await admin
      .patch(`/admin/parents/${USER_IDS.parentA}`, { student_links: [{ student_id: STUDENT_IDS.murid1, relationship: 'ibu' }] })
      .expect(200);
  });
});
