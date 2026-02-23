/**
 * Error thrown when a ULog file is malformed or corrupt.
 *
 * This error class signals that the error is caused by invalid user data (a bad
 * recording) rather than a bug in the code. Consumers can check for this error
 * type to avoid reporting data-quality issues to error-tracking services.
 *
 * The `name` property is set to "ULogError" which is preserved by comlink's
 * error serialization across worker boundaries. Use the static `is()` method
 * to check for this error type regardless of context.
 */
export class ULogError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "ULogError";
  }

  /**
   * Check whether an error is a ULogError. Works both in the same JS context
   * (`instanceof`) and across worker boundaries where only `name` survives.
   */
  static is(error: unknown): boolean {
    return error instanceof ULogError || (error instanceof Error && error.name === "ULogError");
  }
}
