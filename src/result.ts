type Result<T> = T | Error;
export type Type<T> = Result<T>;

export function isErr<T>(result: Result<T>): result is Error {
  return result instanceof Error;
}

export function isOk<T>(result: Result<T>): result is T {
  return !isErr(result);
}
