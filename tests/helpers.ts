import type { Question } from '../src/types';

export function rawQ(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'q1',
    source: 'claude',
    lesson: 3,
    topic: 'Firewall Policies',
    type: 'single',
    question: 'Placeholder question?',
    options: [
      { id: 'A', text: 'one' },
      { id: 'B', text: 'two' },
      { id: 'C', text: 'three' },
    ],
    correct: ['B'],
    ...over,
  };
}

export function mkQ(id: string, over: Partial<Question> = {}): Question {
  return {
    id,
    source: 'claude',
    lesson: 1,
    topic: 'T',
    type: 'single',
    question: 'Q ' + id,
    options: [
      { id: 'A', text: 'a' },
      { id: 'B', text: 'b' },
      { id: 'C', text: 'c' },
      { id: 'D', text: 'd' },
    ],
    correct: ['B'],
    pack: 'p',
    addedAt: 0,
    ...over,
  };
}
