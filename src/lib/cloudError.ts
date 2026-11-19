export class CloudServiceError extends Error {
  constructor(
    message: string,
    readonly code?: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'CloudServiceError';
  }
}
