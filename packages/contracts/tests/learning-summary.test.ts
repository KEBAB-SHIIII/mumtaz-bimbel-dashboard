import { describe, expect, it } from 'vitest';
import {
  generateMonthlySummaryRequestSchema,
  generateMonthlySummaryResponseSchema,
  generateSessionSummaryResponseSchema,
  learningSummaryAiRequestSchema,
  learningSummaryAiResponseSchema,
  learningSummaryViewSchema,
  parentLearningSummariesResponseSchema,
} from '../src/index.js';

const STUDENT_ID = '00000000-0000-4000-8000-000000000001';
const SESSION_ID = '00000000-0000-4000-8000-000000000010';
const GENERATED_AT = '2026-11-23T10:00:00+07:00';

describe('learningSummaryAiRequestSchema', () => {
  it('menerima request monthly multi-subject dengan lebih dari 1 sesi', () => {
    const parsed = learningSummaryAiRequestSchema.parse({
      scope: 'monthly',
      period: '2026-11',
      student_grade: 'SD Kelas 5',
      sessions: [
        {
          lesson_date: '2026-11-05',
          subjects: ['Matematika', 'IPA'],
          duration_minutes: 90,
          learning_material: 'Pecahan campuran dan gaya gesek',
          learning_notes:
            'Siswa memahami penjumlahan pecahan campuran dengan baik, perlu latihan tambahan pada soal cerita.',
        },
        {
          lesson_date: '2026-11-12',
          subjects: ['Bahasa Inggris'],
          duration_minutes: 60,
          learning_material: 'Simple past tense',
          learning_notes: null,
        },
      ],
    });
    expect(parsed.sessions).toHaveLength(2);
    expect(parsed.sessions[0]?.subjects).toEqual(['Matematika', 'IPA']);
    expect(parsed.sessions[1]?.learning_notes).toBeNull();
  });

  it('menerima request session dengan tepat 1 sesi dan learning_notes null (legacy)', () => {
    const parsed = learningSummaryAiRequestSchema.parse({
      scope: 'session',
      period: '2026-11',
      student_grade: 'SMP Kelas 8',
      sessions: [
        {
          lesson_date: '2026-11-05',
          subjects: ['Matematika'],
          duration_minutes: 90,
          learning_material: 'Persamaan linear',
          learning_notes: null,
        },
      ],
    });
    expect(parsed.scope).toBe('session');
  });

  it('menolak scope session jika jumlah sessions lebih dari 1', () => {
    const res = learningSummaryAiRequestSchema.safeParse({
      scope: 'session',
      period: '2026-11',
      student_grade: 'SD Kelas 5',
      sessions: [
        {
          lesson_date: '2026-11-05',
          subjects: ['Matematika'],
          duration_minutes: 90,
          learning_material: 'Pecahan',
          learning_notes: 'Catatan sesi 1',
        },
        {
          lesson_date: '2026-11-12',
          subjects: ['IPA'],
          duration_minutes: 60,
          learning_material: 'Gaya',
          learning_notes: 'Catatan sesi 2',
        },
      ],
    });
    expect(res.success).toBe(false);
  });

  it('menolak subjects kosong', () => {
    const res = learningSummaryAiRequestSchema.safeParse({
      scope: 'session',
      period: '2026-11',
      student_grade: 'SD Kelas 5',
      sessions: [
        {
          lesson_date: '2026-11-05',
          subjects: [],
          duration_minutes: 90,
          learning_material: 'Pecahan',
          learning_notes: 'Catatan sesi',
        },
      ],
    });
    expect(res.success).toBe(false);
  });

  it('menolak field PII ekstra pada request atau item sesi (strictObject)', () => {
    const topLevelPii = learningSummaryAiRequestSchema.safeParse({
      scope: 'session',
      period: '2026-11',
      student_grade: 'SD Kelas 5',
      student_name: 'Nadia Putri',
      sessions: [
        {
          lesson_date: '2026-11-05',
          subjects: ['Matematika'],
          duration_minutes: 90,
          learning_material: 'Pecahan',
          learning_notes: 'Catatan sesi',
        },
      ],
    });
    expect(topLevelPii.success).toBe(false);

    const sessionPii = learningSummaryAiRequestSchema.safeParse({
      scope: 'session',
      period: '2026-11',
      student_grade: 'SD Kelas 5',
      sessions: [
        {
          lesson_date: '2026-11-05',
          subjects: ['Matematika'],
          duration_minutes: 90,
          learning_material: 'Pecahan',
          learning_notes: 'Catatan sesi',
          tutor_name: 'Pak Budi',
        },
      ],
    });
    expect(sessionPii.success).toBe(false);
  });
});

describe('learningSummaryAiResponseSchema', () => {
  it('menerima response valid termasuk array areas_to_improve dan subjects_covered kosong', () => {
    const parsed = learningSummaryAiResponseSchema.parse({
      overall_status: 'very_good',
      summary: 'Ananda menunjukkan pemahaman sangat baik sepanjang sesi.',
      strengths: ['Cepat memahami konsep pecahan'],
      areas_to_improve: [],
      subjects_covered: [],
      model: 'gemini-2.5-flash',
    });
    expect(parsed.overall_status).toBe('very_good');
    expect(parsed.model).toBe('gemini-2.5-flash');
  });

  it('menolak field parent_tips dan overall_status tidak valid', () => {
    const withTips = learningSummaryAiResponseSchema.safeParse({
      overall_status: 'good',
      summary: 'Ananda berkembang baik.',
      strengths: ['Fokus'],
      areas_to_improve: ['Ketelitian'],
      subjects_covered: [{ subject_name: 'Matematika', highlight: 'Pecahan campuran lancar.' }],
      parent_tips: ['Temani belajar'],
    });
    expect(withTips.success).toBe(false);

    const badStatus = learningSummaryAiResponseSchema.safeParse({
      overall_status: 'excellent',
      summary: 'Ananda berkembang baik.',
      strengths: [],
      areas_to_improve: [],
      subjects_covered: [],
    });
    expect(badStatus.success).toBe(false);
  });

  it('menegakkan batas panjang dan jumlah elemen array', () => {
    const tooManyStrengths = learningSummaryAiResponseSchema.safeParse({
      overall_status: 'good',
      summary: 'Ringkasan',
      strengths: ['1', '2', '3', '4', '5', '6'],
      areas_to_improve: [],
      subjects_covered: [],
    });
    expect(tooManyStrengths.success).toBe(false);

    const summaryTooLong = learningSummaryAiResponseSchema.safeParse({
      overall_status: 'good',
      summary: 'a'.repeat(1001),
      strengths: [],
      areas_to_improve: [],
      subjects_covered: [],
    });
    expect(summaryTooLong.success).toBe(false);
  });
});

describe('Parent API learning summary schemas', () => {
  const validView = {
    overall_status: 'good' as const,
    summary: 'Perkembangan belajar bulan ini baik.',
    strengths: ['Konsisten mengerjakan latihan'],
    areas_to_improve: ['Ketelitian soal cerita'],
    subjects_covered: [
      { subject_name: 'Matematika', highlight: 'Pecahan campuran sudah dikuasai.' },
    ],
    generated_at: GENERATED_AT,
    is_stale: false,
  };

  it('menolak kebocoran field internal (provider, model, admin_note) pada view & response', () => {
    expect(learningSummaryViewSchema.parse(validView).is_stale).toBe(false);

    for (const leaked of [{ provider: 'genai_fastapi' }, { model: 'gemini' }, { admin_note: 'x' }]) {
      const res = learningSummaryViewSchema.safeParse({ ...validView, ...leaked });
      expect(res.success).toBe(false);
    }

    const parentResponse = parentLearningSummariesResponseSchema.parse({
      student_id: STUDENT_ID,
      period: '2026-11',
      approved_session_count: 1,
      monthly: validView,
      sessions: {
        [SESSION_ID]: validView,
      },
    });
    expect(parentResponse.monthly?.overall_status).toBe('good');
    expect(parentResponse.sessions[SESSION_ID]?.is_stale).toBe(false);

    expect(
      generateMonthlySummaryRequestSchema.parse({ period: '2026-11' }).period,
    ).toBe('2026-11');
    expect(
      generateMonthlySummaryResponseSchema.parse({ summary: validView, cached: true }).cached,
    ).toBe(true);
    expect(
      generateSessionSummaryResponseSchema.parse({
        lesson_session_id: SESSION_ID,
        summary: validView,
        cached: false,
      }).lesson_session_id,
    ).toBe(SESSION_ID);
  });
});
