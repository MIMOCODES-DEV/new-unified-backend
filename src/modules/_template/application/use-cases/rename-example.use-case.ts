import { Injectable } from '@nestjs/common';
import { err, ok, type Result } from '../../../../shared/kernel/result.js';
import type { Example } from '../../domain/example.entity.js';
import { ExampleNotFoundError, type InvalidExampleNameError } from '../../domain/example.errors.js';
import { ExampleRepository } from '../ports/example.repository.js';

export interface RenameExampleInput {
  id: string;
  name: string;
}

/** One use case = one action = one public `execute`. It knows nothing about HTTP or wire formats. */
@Injectable()
export class RenameExampleUseCase {
  constructor(private readonly examples: ExampleRepository) {}

  async execute(
    input: RenameExampleInput,
  ): Promise<Result<Example, ExampleNotFoundError | InvalidExampleNameError>> {
    const example = await this.examples.findById(input.id);
    if (!example) {
      return err(new ExampleNotFoundError('Example not found', { id: input.id }));
    }

    const renamed = example.rename(input.name);
    if (!renamed.ok) {
      return renamed;
    }

    await this.examples.save(example);
    return ok(example);
  }
}
