import { SOURCES, type ExamDef, type Question, type Source } from '../types';

export const MAX_OPTIONS = 8;

export type Validated<T> = { ok: true; value: T } | { ok: false; errors: string[] };

function isObj(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x);
}
function nonEmptyStr(x: unknown): x is string {
  return typeof x === 'string' && x.trim().length > 0;
}

// Only the prefix is checked (images can be megabytes); the browser rejects broken payloads on render.
const IMAGE_RE = /^data:image\/(png|jpe?g|gif|webp|svg\+xml|bmp)[;,]/i;

/** Validates one raw (unknown) question. Returns a normalised Question or the list of problems. */
export function validateQuestion(raw: unknown, pack: string, now = Date.now()): Validated<Question> {
  const errors: string[] = [];
  if (!isObj(raw)) return { ok: false, errors: ['pitanje nije objekt'] };

  const id = raw.id;
  if (!nonEmptyStr(id)) errors.push('nedostaje "id"');

  const source = raw.source;
  if (typeof source !== 'string' || !(SOURCES as readonly string[]).includes(source)) {
    errors.push(`"source" mora biti jedan od: ${SOURCES.join(', ')}`);
  }

  const lesson = raw.lesson;
  if (typeof lesson !== 'number' || !Number.isInteger(lesson) || lesson < 1 || lesson > 16) {
    errors.push('"lesson" mora biti cijeli broj 1-16');
  }

  if (!nonEmptyStr(raw.topic)) errors.push('nedostaje "topic"');

  const type = raw.type;
  if (type !== 'single' && type !== 'multi') errors.push('"type" mora biti "single" ili "multi"');

  if (!nonEmptyStr(raw.question)) errors.push('nedostaje tekst pitanja ("question")');

  // options
  const optionIds: string[] = [];
  const options: { id: string; text: string }[] = [];
  if (!Array.isArray(raw.options)) {
    errors.push('"options" mora biti niz');
  } else {
    if (raw.options.length < 2) errors.push('potrebne su najmanje 2 opcije');
    if (raw.options.length > MAX_OPTIONS) errors.push(`najviše ${MAX_OPTIONS} opcija`);
    const seen = new Set<string>();
    raw.options.forEach((o, i) => {
      if (!isObj(o)) {
        errors.push(`opcija #${i + 1} nije objekt`);
        return;
      }
      if (!nonEmptyStr(o.id)) {
        errors.push(`opcija #${i + 1} nema "id"`);
        return;
      }
      if (!nonEmptyStr(o.text)) errors.push(`opcija "${o.id}" nema "text"`);
      if (seen.has(o.id)) errors.push(`duplikat option id "${o.id}"`);
      seen.add(o.id);
      optionIds.push(o.id);
      options.push({ id: o.id, text: typeof o.text === 'string' ? o.text : '' });
    });
  }

  // correct
  let correct: string[] = [];
  if (!Array.isArray(raw.correct) || raw.correct.length === 0) {
    errors.push('"correct" mora biti neprazan niz');
  } else {
    const bad = raw.correct.filter((c) => typeof c !== 'string');
    if (bad.length) errors.push('"correct" smije sadržavati samo stringove');
    else {
      correct = raw.correct as string[];
      if (new Set(correct).size !== correct.length) errors.push('"correct" sadrži duplikate');
      const missing = correct.filter((c) => !optionIds.includes(c));
      if (missing.length) errors.push(`"correct" referencira nepostojeće opcije: ${missing.join(', ')}`);
      if (type === 'single' && correct.length !== 1) errors.push('type "single" traži tačno 1 tačan odgovor');
      if (type === 'multi' && correct.length < 2) errors.push('type "multi" traži 2 ili više tačnih odgovora');
    }
  }

  if (raw.explanation !== undefined && raw.explanation !== null && typeof raw.explanation !== 'string') {
    errors.push('"explanation" mora biti string');
  }
  if (raw.image !== undefined && raw.image !== null && raw.image !== '') {
    if (typeof raw.image !== 'string' || !IMAGE_RE.test(raw.image.slice(0, 64))) {
      errors.push('"image" mora biti data:image/... URI');
    }
  }

  if (errors.length) return { ok: false, errors };

  const q: Question = {
    id: (id as string).trim(),
    source: source as Source,
    lesson: lesson as number,
    topic: (raw.topic as string).trim(),
    type: type as 'single' | 'multi',
    question: raw.question as string,
    options,
    correct,
    pack,
    addedAt: now,
  };
  if (typeof raw.explanation === 'string' && raw.explanation.trim()) q.explanation = raw.explanation;
  if (typeof raw.image === 'string' && raw.image) q.image = raw.image;
  return { ok: true, value: q };
}

export function validateExam(raw: unknown, pack: string): Validated<ExamDef> {
  const errors: string[] = [];
  if (!isObj(raw)) return { ok: false, errors: ['ispit nije objekt'] };
  if (!nonEmptyStr(raw.id)) errors.push('nedostaje "id"');
  if (!nonEmptyStr(raw.name)) errors.push('nedostaje "name"');
  let ids: string[] = [];
  if (!Array.isArray(raw.questionIds) || raw.questionIds.length === 0) {
    errors.push('"questionIds" mora biti neprazan niz');
  } else if (raw.questionIds.some((x) => !nonEmptyStr(x))) {
    errors.push('"questionIds" smije sadržavati samo neprazne stringove');
  } else {
    ids = raw.questionIds as string[];
    if (new Set(ids).size !== ids.length) errors.push('"questionIds" sadrži duplikate');
  }
  const dur = raw.durationMinutes;
  if (typeof dur !== 'number' || !isFinite(dur) || dur <= 0) errors.push('"durationMinutes" mora biti broj > 0');
  const pass = raw.passPercent;
  if (typeof pass !== 'number' || !isFinite(pass) || pass < 0 || pass > 100) {
    errors.push('"passPercent" mora biti broj 0-100');
  }
  if (errors.length) return { ok: false, errors };
  return {
    ok: true,
    value: {
      id: (raw.id as string).trim(),
      name: (raw.name as string).trim(),
      questionIds: ids,
      durationMinutes: dur as number,
      passPercent: pass as number,
      pack,
    },
  };
}
