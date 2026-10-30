import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  parentAccessCodeIssuedSchema,
  parentSchema,
  paginatedSchema,
  studentSchema,
  subjectSchema,
  tutorAssignmentSchema,
  tutorRateSchema,
  tutorSchema,
} from '@mumtaz/contracts';
import { ASSIGNMENT_IDS, STUDENT_IDS, SUBJECT_IDS, TUTOR_IDS, USER_IDS } from '@mumtaz/contracts/fixtures';
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

  it('create: users+tutors satu transaksi, password tidak pernah dikembalikan, bisa login', async () => {
    const res = await admin.post('/admin/tutors', {
      full_name: 'Dewi',
      username: 'dewi',
      initial_password: 'password-awal-tutor-c',
      phone: '080000000003',
    });
    expect(res.status).toBe(201);
    const tutor = tutorSchema.parse(res.body);
    expect(tutor).toMatchObject({ full_name: 'Dewi', is_active: true, login_active: true });
    expect(JSON.stringify(res.body)).not.toMatch(/password/i);
    await new TestClient(t.app).login('dewi', 'password-awal-tutor-c');
  });

  it('username duplikat → 409 CONFLICT dengan pesan aman', async () => {
    const res = await admin.post('/admin/tutors', {
      full_name: 'Duplikat',
      username: 'farhan',
      initial_password: 'password-panjang-123',
    });
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

describe('Master Data → Penugasan & Tarif', () => {
  it('assignment aktif dengan tuple sama dan periode overlap → 409', async () => {
    const res = await admin.post('/admin/tutor-assignments', {
      tutor_id: TUTOR_IDS.tutorA,
      student_id: STUDENT_IDS.murid1,
      subject_id: SUBJECT_IDS.matematika,
      start_date: '2026-10-01',
    });
    expect(res.status).toBe(409);
    expect(res.body.error.details[0].field).toBe('start_date');
  });

  it('assignment baru valid; tuple immutable pada PATCH', async () => {
    const created = tutorAssignmentSchema.parse(
      (
        await admin
          .post('/admin/tutor-assignments', {
            tutor_id: TUTOR_IDS.tutorA,
            student_id: STUDENT_IDS.murid3,
            subject_id: SUBJECT_IDS.matematika,
            start_date: '2026-10-01',
          })
          .expect(201)
      ).body,
    );
    expect(created).toMatchObject({ tutor_name: 'Farhan', student_name: 'Citra', subject_name: 'Matematika' });

    const tuple = await admin.patch(`/admin/tutor-assignments/${created.id}`, { student_id: STUDENT_IDS.murid1 });
    expect(tuple.status).toBe(422);
    const endBefore = await admin.patch(`/admin/tutor-assignments/${created.id}`, { end_date: '2026-09-01' });
    expect(endBefore.status).toBe(422);
  });

  it('assignment untuk siswa nonaktif → 422', async () => {
    const student = studentSchema.parse(
      (await admin.post('/admin/students', { full_name: 'Nonaktif', grade: '1 SD', school_name: 'S' }).expect(201)).body,
    );
    await admin.patch(`/admin/students/${student.id}`, { is_active: false }).expect(200);
    const res = await admin.post('/admin/tutor-assignments', {
      tutor_id: TUTOR_IDS.tutorA,
      student_id: student.id,
      subject_id: SUBJECT_IDS.ipa,
      start_date: '2026-10-01',
    });
    expect(res.status).toBe(422);
    expect(res.body.error.details[0].field).toBe('student_id');
  });

  it('tarif overlap → 409; tarif berurutan setelah ditutup → 201', async () => {
    const overlap = await admin.post('/admin/tutor-rates', {
      assignment_id: ASSIGNMENT_IDS.tutorAMurid1Matematika,
      rate_type: 'per_session',
      rate_amount: '60000',
      is_demo_assumption: true,
      effective_from: '2026-12-01',
    });
    expect(overlap.status).toBe(409);

    const rates = await admin.get(`/admin/tutor-rates?assignment_id=${ASSIGNMENT_IDS.tutorAMurid1Matematika}`).expect(200);
    const [current] = paginatedSchema(tutorRateSchema).parse(rates.body).items;
    expect(current).toMatchObject({ rate_amount: '50000', is_demo_assumption: true });
    if (!current) throw new Error('tarif fixture tidak ada');

    await admin.patch(`/admin/tutor-rates/${current.id}`, { effective_to: '2026-11-30' }).expect(200);
    const next = await admin.post('/admin/tutor-rates', {
      assignment_id: ASSIGNMENT_IDS.tutorAMurid1Matematika,
      rate_type: 'per_session',
      rate_amount: '60000',
      is_demo_assumption: true,
      effective_from: '2026-12-01',
    });
    expect(next.status).toBe(201);
    expect(tutorRateSchema.parse(next.body).rate_amount).toBe('60000');
  });

  it('nominal/jenis tarif tidak bisa diubah lewat PATCH', async () => {
    const rates = await admin.get('/admin/tutor-rates').expect(200);
    const id = (rates.body.items[0] as { id: string }).id;
    expect((await admin.patch(`/admin/tutor-rates/${id}`, { rate_amount: '1' })).status).toBe(422);
  });
});
