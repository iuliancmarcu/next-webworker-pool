import { WebWorkerPool } from './WebWorkerPool';

export { WebWorkerPool } from './WebWorkerPool';
export { TaskExecutor as TaskScheduler } from './TaskExecutor';

export type {
    TaskId,
    TaskSuccess,
    TaskError,
    TaskResult,
    TaskResultHandler,
    Task,
} from './TaskExecutor';

export function createWorkerPool<I, O, E extends Error = Error>(
    createWorker: () => Worker,
    options?: { maxWorkers?: number },
): WebWorkerPool<I, O, E> {
    class Pool extends WebWorkerPool<I, O, E> {
        protected _createWorker(): Worker {
            return createWorker();
        }
    }

    return new Pool(options);
}
