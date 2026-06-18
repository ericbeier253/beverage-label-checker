import Database from 'better-sqlite3';
import path from 'path';
import { TTBForm, mockForms as initialMockForms } from '@/data/mockForms';

// Ensure the data directory exists
const dbPath = path.join(process.cwd(), 'forms.db');
const db = new Database(dbPath);

// Initialize table
db.exec(`
  CREATE TABLE IF NOT EXISTS forms (
    id TEXT PRIMARY KEY,
    brandName TEXT NOT NULL,
    classType TEXT NOT NULL,
    alcvol REAL NOT NULL,
    proof REAL NOT NULL,
    netContents TEXT NOT NULL,
    governmentWarning TEXT NOT NULL,
    producerName TEXT NOT NULL,
    countryOfOrigin TEXT,
    status TEXT NOT NULL,
    hash TEXT,
    approvedLabel TEXT,
    contactEmail TEXT
  )
`);

// Check if table is empty, if so, seed it
const rowCount = db.prepare('SELECT count(*) as count FROM forms').get() as { count: number };
if (rowCount.count === 0) {
  console.log('Seeding SQLite database with initial mock forms...');
  const insert = db.prepare(`
    INSERT OR IGNORE INTO forms (
      id, brandName, classType, alcvol, proof, netContents, 
      governmentWarning, producerName, countryOfOrigin, 
      status, hash, approvedLabel, contactEmail
    ) VALUES (
      @id, @brandName, @classType, @alcvol, @proof, @netContents, 
      @governmentWarning, @producerName, @countryOfOrigin, 
      @status, @hash, @approvedLabel, @contactEmail
    )
  `);

  const insertMany = db.transaction((forms: TTBForm[]) => {
    for (const form of forms) {
      insert.run({
        id: form.id,
        brandName: form.brandName,
        classType: form.classType,
        alcvol: form.alcvol,
        proof: form.proof,
        netContents: form.netContents,
        governmentWarning: form.governmentWarning,
        producerName: form.producerName,
        countryOfOrigin: form.countryOfOrigin || null,
        status: form.status,
        hash: form.hash || null,
        approvedLabel: form.approvedLabel || null,
        contactEmail: form.contactEmail || null,
      });
    }
  });

  insertMany(initialMockForms);
  console.log('Database seeding complete.');
}

export function getAllFormsFromDb(): TTBForm[] {
  return db.prepare('SELECT * FROM forms').all() as TTBForm[];
}

export function getFormByIdFromDb(id: string): TTBForm | undefined {
  return db.prepare('SELECT * FROM forms WHERE id = ?').get(id) as TTBForm | undefined;
}

export function createFormInDb(form: TTBForm): void {
  const insert = db.prepare(`
    INSERT INTO forms (
      id, brandName, classType, alcvol, proof, netContents, 
      governmentWarning, producerName, countryOfOrigin, 
      status, hash, approvedLabel, contactEmail
    ) VALUES (
      @id, @brandName, @classType, @alcvol, @proof, @netContents, 
      @governmentWarning, @producerName, @countryOfOrigin, 
      @status, @hash, @approvedLabel, @contactEmail
    )
  `);
  insert.run({
    id: form.id,
    brandName: form.brandName,
    classType: form.classType,
    alcvol: form.alcvol,
    proof: form.proof,
    netContents: form.netContents,
    governmentWarning: form.governmentWarning,
    producerName: form.producerName,
    countryOfOrigin: form.countryOfOrigin || null,
    status: form.status,
    hash: form.hash || null,
    approvedLabel: form.approvedLabel || null,
    contactEmail: form.contactEmail || null,
  });
}

export function updateFormInDb(id: string, updates: Partial<TTBForm>): TTBForm | undefined {
  const existing = getFormByIdFromDb(id);
  if (!existing) return undefined;

  const merged = { ...existing, ...updates };

  const update = db.prepare(`
    UPDATE forms SET 
      brandName = @brandName,
      classType = @classType,
      alcvol = @alcvol,
      proof = @proof,
      netContents = @netContents,
      governmentWarning = @governmentWarning,
      producerName = @producerName,
      countryOfOrigin = @countryOfOrigin,
      status = @status,
      hash = @hash,
      approvedLabel = @approvedLabel,
      contactEmail = @contactEmail
    WHERE id = @id
  `);

  update.run({
    id: merged.id,
    brandName: merged.brandName,
    classType: merged.classType,
    alcvol: merged.alcvol,
    proof: merged.proof,
    netContents: merged.netContents,
    governmentWarning: merged.governmentWarning,
    producerName: merged.producerName,
    countryOfOrigin: merged.countryOfOrigin || null,
    status: merged.status,
    hash: merged.hash || null,
    approvedLabel: merged.approvedLabel || null,
    contactEmail: merged.contactEmail || null,
  });

  return merged;
}

export function deleteFormFromDb(id: string): void {
  db.prepare('DELETE FROM forms WHERE id = ?').run(id);
}

export function getFormByHashFromDb(hash: string): TTBForm | undefined {
  return db.prepare('SELECT * FROM forms WHERE hash = ?').get(hash) as TTBForm | undefined;
}

// Levenshtein distance algorithm for fuzzy matching lookup hashes
function levenshteinDistance(a: string, b: string): number {
  if (!a) return b ? b.length : 0;
  if (!b) return a ? a.length : 0;

  const matrix = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 0; j <= b.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      if (a[i - 1] === b[j - 1]) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1,     // insertion
          matrix[i - 1][j] + 1      // deletion
        );
      }
    }
  }

  return matrix[a.length][b.length];
}

export function getClosestFormByHashFromDb(hash: string, threshold: number = 20): { form: TTBForm, distance: number } | undefined {
  const allForms = getAllFormsFromDb();
  let closestForm: TTBForm | undefined;
  let minDistance = Infinity;

  for (const form of allForms) {
    if (!form.hash) continue;
    const distance = levenshteinDistance(hash, form.hash);
    if (distance < minDistance) {
      minDistance = distance;
      closestForm = form;
    }
  }

  if (closestForm && minDistance <= threshold) {
    return { form: closestForm, distance: minDistance };
  }

  return undefined;
}
