import type { Example } from '../../domain/example.entity.js';

/**
 * Port: what the use cases need from storage, not how it is stored.
 * An abstract class (not an interface) so it can be used as a Nest injection token.
 */
export abstract class ExampleRepository {
  abstract findById(id: string): Promise<Example | null>;
  abstract save(example: Example): Promise<void>;
}
