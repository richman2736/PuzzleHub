import * as SQLite from "expo-sqlite";

let writeQueue: Promise<void> = Promise.resolve();

export async function runExclusiveWrite<T>(
  db: SQLite.SQLiteDatabase,
  task: (tx: SQLite.SQLiteDatabase) => Promise<T>,
): Promise<T> {
  const previousWrite = writeQueue;
  let releaseWrite!: () => void;

  writeQueue = new Promise<void>((resolve) => {
    releaseWrite = resolve;
  });

  await previousWrite;

  try {
    let result: T | undefined;

    await db.withExclusiveTransactionAsync(async (tx) => {
      result = await task(tx);
    });

    return result as T;
  } finally {
    releaseWrite();
  }
}
