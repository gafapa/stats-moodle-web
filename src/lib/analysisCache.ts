import type { CourseAnalysis } from "../types";

const DATABASE_NAME = "moodle-analyzer-web";
const DATABASE_VERSION = 1;
const STORE_NAME = "analysis-cache";

export type AnalysisCacheMeta = {
  key: string;
  baseUrl: string;
  courseId: number;
  courseName: string;
  passThresholdPct: number;
  savedAt: string;
};

type AnalysisCacheEntry = AnalysisCacheMeta & {
  analysis: CourseAnalysis;
};

function openCacheDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open(DATABASE_NAME, DATABASE_VERSION);

    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME, { keyPath: "key" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function withStore<T>(
  mode: IDBTransactionMode,
  worker: (store: IDBObjectStore) => Promise<T> | T,
): Promise<T> {
  return openCacheDatabase().then((database) => {
    return new Promise<T>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, mode);
      const store = transaction.objectStore(STORE_NAME);

      Promise.resolve(worker(store))
        .then((value) => {
          transaction.oncomplete = () => {
            database.close();
            resolve(value);
          };
          transaction.onerror = () => {
            database.close();
            reject(transaction.error);
          };
        })
        .catch((error) => {
          database.close();
          reject(error);
        });
    });
  });
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export function buildAnalysisCacheKey(baseUrl: string, courseId: number, passThresholdPct: number): string {
  return [
    baseUrl.replace(/\/+$/, "").toLowerCase(),
    courseId,
    passThresholdPct,
  ].join("::");
}

export async function loadCachedAnalysis(
  baseUrl: string,
  courseId: number,
  passThresholdPct: number,
): Promise<AnalysisCacheEntry | null> {
  const key = buildAnalysisCacheKey(baseUrl, courseId, passThresholdPct);
  return withStore("readonly", async (store) => {
    const entry = await requestToPromise(store.get(key));
    return (entry as AnalysisCacheEntry | undefined) ?? null;
  });
}

export async function saveCachedAnalysis(
  baseUrl: string,
  courseId: number,
  passThresholdPct: number,
  analysis: CourseAnalysis,
): Promise<void> {
  const entry: AnalysisCacheEntry = {
    key: buildAnalysisCacheKey(baseUrl, courseId, passThresholdPct),
    baseUrl: baseUrl.replace(/\/+$/, ""),
    courseId,
    courseName: analysis.course.fullname ?? analysis.course.shortname ?? `Course ${courseId}`,
    passThresholdPct,
    savedAt: new Date().toISOString(),
    analysis: {
      ...analysis,
      analyzedAt: new Date().toISOString(),
    },
  };

  return withStore("readwrite", async (store) => {
    await requestToPromise(store.put(entry));
  });
}

export async function listCachedAnalyses(baseUrl: string): Promise<AnalysisCacheMeta[]> {
  return withStore("readonly", async (store) => {
    const entries = await requestToPromise(store.getAll());
    return (entries as AnalysisCacheEntry[])
      .filter((entry) => entry.baseUrl.toLowerCase() === baseUrl.replace(/\/+$/, "").toLowerCase())
      .map((entry) => ({
        key: entry.key,
        baseUrl: entry.baseUrl,
        courseId: entry.courseId,
        courseName: entry.courseName,
        passThresholdPct: entry.passThresholdPct,
        savedAt: entry.savedAt,
      }))
      .sort((left, right) => right.savedAt.localeCompare(left.savedAt));
  });
}
