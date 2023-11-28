import { Task, TaskId, TaskScheduler } from './TaskScheduler';

/**
 * Represents a pool of web workers that can execute tasks asynchronously.
 *
 * @template I The type of input for the tasks.
 * @template O The type of output for the tasks.
 * @template E The type of error that can occur during task execution.
 */
export abstract class WebWorkerPool<
    I,
    O,
    E extends Error = Error,
> extends TaskScheduler<I, O, E> {
    /** Holds the workers in the pool */
    private readonly _workers: Worker[] = [];

    /** Holds the task ID currently executed by a worker */
    private readonly _workerTask: Map<Worker, TaskId> = new Map();

    constructor(options?: { maxWorkers?: number }) {
        super();

        if (typeof Worker === 'undefined') {
            console.warn(
                'Worker() is not supported in this environment. Tasks will not be executed.',
            );

            return;
        }

        this._workers = new Array(
            options?.maxWorkers ?? navigator?.hardwareConcurrency ?? 4,
        )
            .fill(null)
            .map(() => this._newBindedWorker());
    }

    /**
     * This method is implemented by the concrete class.
     * We are using this approach because Next.js is looking for Worker instantiation
     * in the form of `new Worker(new URL(<workerPath>, import.meta.url))`, meaning
     * that we cannot just pass the worker path as a string in the constructor.
     */
    protected abstract createWorker(): Worker;

    /**
     * Schedules the next task to be executed by a worker.
     * If a worker is available, the next task in the queue is assigned to the worker and executed.
     * If no worker is available, the task will be scheduled when a worker becomes available.
     *
     * @override This method is called by the base class when a new task is enqueued.
     */
    protected scheduleTask() {
        const worker = this._nextFreeWorker();

        if (worker) {
            const task = this._taskQueue.shift();

            if (task) {
                this._workerTask.set(worker, task.id);
                worker.postMessage(task);
            }
        }
    }

    /**
     * Cancels a task in the worker pool.
     * If the task is in the queue, it will be removed.
     * If the task is currently being executed by a worker, the worker will be replaced.
     *
     * @param taskId The ID of the task to cancel.
     * @override This method is called by the base class when a task is cancelled.
     */
    public cancelTask(taskId: TaskId): void {
        super.cancelTask(taskId);

        // If the task is currently executed by a worker, replace the worker
        this._replaceWorker(
            this._workers.find(
                (w) => this._workerTask.get(w) === taskId,
            ) as Worker,
            new Error('Task cancelled by user.') as E,
        );
    }

    /**
     * Terminates all workers in the pool.
     */
    public terminate() {
        this._workers.forEach((worker) => worker.terminate());
    }

    /**
     * Creates a new worker and binds the message event handlers.
     *
     * @returns The new worker.
     */
    private _newBindedWorker(): Worker {
        const worker = this.createWorker();

        worker.addEventListener(
            'message',
            this._handleWorkerMessage.bind(this),
        );
        worker.addEventListener('error', this._handleWorkerError.bind(this));

        return worker;
    }

    /**
     * Handles a message received from a worker. The message itself can be a task result or a task
     * error, depending on the worker's implementation.
     *
     * @param event The message event containing the task result.
     */
    private _handleWorkerMessage(event: MessageEvent<Task<O>>) {
        const { data, target: worker } = event;
        const workerTaskId = this._workerTask.get(worker as Worker);

        if (data?.id == null) {
            throw new Error(
                `Invalid task result missing task ID was received from worker processing task with ID "${workerTaskId}"`,
            );
        }

        const resultHandler = this._resultHandlers.get(data.id);

        if (resultHandler) {
            resultHandler(data);
        }

        // Remove the result handler and the current worker task id.
        this._resultHandlers.delete(data.id);
        this._workerTask.delete(worker as Worker);

        // Schedule the next task for the worker.
        this.scheduleTask();
    }

    /**
     * Handles the error event emitted by a worker - this is a script error, not a task error.
     * Executes the reject callback for all tasks currently assigned to the worker.
     *
     * @param event The error event.
     */
    private _handleWorkerError(event: ErrorEvent) {
        const { target: worker, error } = event;

        // Replace the worker with a new one.
        this._replaceWorker(worker as Worker, error);

        // Schedule the next task for the worker.
        this.scheduleTask();
    }

    /**
     * Replaces a worker in the pool with a new worker.
     * If an error is provided, it will be passed to the result handler of any pending task assigned to the worker being replaced.
     * @param worker - The worker to be replaced.
     * @param error - Optional error to be passed to the result handler of pending tasks.
     */
    private _replaceWorker(worker: Worker, error?: E) {
        const workerIndex = this._workers.indexOf(worker);

        // If the worker is not in the pool, there is nothing to do.
        if (workerIndex < 0) {
            return;
        }

        // Otherwise, replace the worker with a new one.
        this._workers.splice(workerIndex, 1);
        this._workers.push(this._newBindedWorker());

        // If the worker had no task assigned, there is nothing to do.
        if (!this._workerTask.has(worker)) {
            return;
        }

        // Otherwise, execute the reject callback for the task assigned to the worker.
        const taskId = this._workerTask.get(worker) as TaskId;
        const resultHandler = this._resultHandlers.get(taskId);

        if (resultHandler) {
            const resultError =
                error ||
                new Error('Task cancelled because of worker replacement');

            resultHandler({
                id: taskId,
                error: resultError as E,
            });
        }

        this._resultHandlers.delete(taskId);
        this._workerTask.delete(worker);
    }

    /**
     * Returns the next available worker from the pool.
     * A worker is considered available if it is not currently assigned to a task.
     *
     * @returns The next available worker, or undefined if no worker is available.
     */
    private _nextFreeWorker(): Worker {
        const worker = this._workers.find(
            (w) => !this._workerTask.has(w) && w,
        ) as Worker;

        return worker;
    }
}
