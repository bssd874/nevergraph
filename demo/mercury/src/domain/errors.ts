export class InvalidOrderTransitionError extends Error {
  constructor(
    public readonly from: string,
    public readonly to: string,
    message?: string,
  ) {
    super(message ?? `Cannot transition order from ${from} to ${to}`);
    this.name = "InvalidOrderTransitionError";
  }
}
