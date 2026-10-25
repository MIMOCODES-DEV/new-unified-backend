import { err, ok, type Result } from '../../../shared/kernel/result.js';
import { InvalidExampleNameError } from './example.errors.js';

const MAX_NAME_LENGTH = 100;

/** Entities hold state and enforce their own rules. Pure TypeScript: no Nest, no Mongo. */
export class Example {
  private constructor(
    readonly id: string,
    private _name: string,
    readonly createdAt: Date,
  ) {}

  static create(props: {
    id: string;
    name: string;
    now: Date;
  }): Result<Example, InvalidExampleNameError> {
    const name = props.name.trim();
    if (!Example.isValidName(name)) {
      return err(
        new InvalidExampleNameError('Name must be 1-100 characters', { name: props.name }),
      );
    }
    return ok(new Example(props.id, name, props.now));
  }

  /** Rebuilds an entity from storage. Only repositories call this. */
  static restore(props: { id: string; name: string; createdAt: Date }): Example {
    return new Example(props.id, props.name, props.createdAt);
  }

  get name(): string {
    return this._name;
  }

  rename(name: string): Result<void, InvalidExampleNameError> {
    const trimmed = name.trim();
    if (!Example.isValidName(trimmed)) {
      return err(new InvalidExampleNameError('Name must be 1-100 characters', { name }));
    }
    this._name = trimmed;
    return ok(undefined);
  }

  private static isValidName(name: string): boolean {
    return name.length > 0 && name.length <= MAX_NAME_LENGTH;
  }
}
