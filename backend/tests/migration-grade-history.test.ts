import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { expect, it } from 'vitest';

it('backfills legacy class/basis without changing historical gross or admin amounts',async()=>{
 const db=new PGlite();
 try {
  await db.exec(`CREATE TABLE users(id uuid PRIMARY KEY);
   CREATE TABLE students(id uuid PRIMARY KEY, grade varchar(30));
   CREATE TABLE lesson_sessions(id integer PRIMARY KEY, student_id uuid, duration_minutes integer, rate_amount_snapshot numeric(12,2), admin_fee_snapshot numeric(12,2));
   INSERT INTO students VALUES ('00000000-0000-4000-8000-000000000001','4 SD');
   INSERT INTO lesson_sessions VALUES (1,'00000000-0000-4000-8000-000000000001',90,90000,20000), (2,'00000000-0000-4000-8000-000000000001',60,NULL,NULL);`);
  const sql=readFileSync(new URL('../drizzle/0009_complete_wasp.sql',import.meta.url),'utf8');
  await db.exec(sql);
  const {rows}=await db.query<{grade_snapshot:string;grade_source:string;hourly_rate_snapshot:string;rate_amount_snapshot:string|null;admin_fee_snapshot:string|null}>('SELECT * FROM lesson_sessions ORDER BY id');
  expect(rows[0]).toMatchObject({grade_snapshot:'4 SD',grade_source:'legacy',hourly_rate_snapshot:'60000.00',rate_amount_snapshot:'90000.00',admin_fee_snapshot:'20000.00'});
  expect(rows[1]).toMatchObject({hourly_rate_snapshot:'80000.00',rate_amount_snapshot:null,admin_fee_snapshot:null});
  expect((await db.query('SELECT grade FROM student_grade_history')).rows).toEqual([{grade:'4 SD'}]);
 } finally {await db.close();}
});
