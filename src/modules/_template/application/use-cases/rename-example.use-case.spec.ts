import { beforeEach, describe, expect, it } from 'vitest';
import { Example } from '../../domain/example.entity.js';
import { ExampleRepository } from '../ports/example.repository.js';
import { RenameExampleUseCase } from './rename-example.use-case.js';

class InMemoryExampleRepository extends ExampleRepository {
  readonly items = new Map<string, Example>();

  findById(id: string): Promise<Example | null> {
    return Promise.resolve(this.items.get(id) ?? null);
  }

  save(example: Example): Promise<void> {
    this.items.set(example.id, example);
    return Promise.resolve();
  }
}

describe('RenameExampleUseCase', () => {
  let repository: InMemoryExampleRepository;
  let useCase: RenameExampleUseCase;

  beforeEach(() => {
    repository = new InMemoryExampleRepository();
    repository.items.set('e1', Example.restore({ id: 'e1', name: 'old', createdAt: new Date(0) }));
    useCase = new RenameExampleUseCase(repository);
  });

  it('renames and saves the example', async () => {
    const result = await useCase.execute({ id: 'e1', name: '  new name ' });

    expect(result.ok).toBe(true);
    expect(repository.items.get('e1')?.name).toBe('new name');
  });

  it('returns a not-found error for an unknown id', async () => {
    const result = await useCase.execute({ id: 'missing', name: 'x' });

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.code).toBe('template.not_found');
  });

  it('rejects an empty name and does not save', async () => {
    const result = await useCase.execute({ id: 'e1', name: '   ' });

    expect(!result.ok && result.error.code).toBe('template.invalid_name');
    expect(repository.items.get('e1')?.name).toBe('old');
  });
});
