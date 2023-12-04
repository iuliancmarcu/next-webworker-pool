import { Task, TaskId, TaskExecutor } from './TaskExecutor';

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
> extends TaskExecutor<I, O, E> {
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
    protected abstract _createWorker(): Worker;

    /**
     * Tries to run a task inside a free worker.
     *
     * If a worker is available, the task is assigned to the worker and executed.
     * If no worker is available, the task will be re-scheduled later on.
     *
     * @returns True if a task was scheduled, false otherwise.
     * @override This method is called by the base class when a task is scheduled to run.
     */
    protected _runTask(task: Task<I>): boolean {
        const worker = this._nextFreeWorker();

        if (worker) {
            this._workerTask.set(worker, task.id);
            worker.postMessage(task);

            return true;
        }

        return false;
    }

    /**
     * Cancels a task in the worker pool.
     * If the task is in the queue, it will be removed.
     * If the task is currently being executed by a worker, the worker will be replaced.
     *
     * @param taskId The ID of the task to cancel.
     * @override This method is called by the base class when a task is cancelled.
     */
    public cancelTask(taskId: TaskId, error?: E): void {
        super.cancelTask(taskId, error);

        const executingWorker = this._workers.find(
            (w) => this._workerTask.get(w) === taskId,
        ) as Worker;

        // If the task is currently executed by a worker, replace the worker
        if (executingWorker) {
            this._replaceWorker(
                this._workers.find(
                    (w) => this._workerTask.get(w) === taskId,
                ) as Worker,
            );
        }
    }

    /**
     * Terminates all workers in the pool.
     */
    public terminate() {
        this._workers.forEach((worker) => worker.terminate());
        this._workers.splice(0, this._workers.length);
    }

    /**
     * Creates a new worker and binds the message event handlers.
     *
     * @returns The new worker.
     */
    private _newBindedWorker(): Worker {
        const worker = this._createWorker();

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

        // Unassign the worker from the task.
        this._workerTask.delete(worker as Worker);

        this._handleTaskResult(data);
    }

    /**
     * Handles the error event emitted by a worker - this is a script error, not a task error.
     * Executes the reject callback for all tasks currently assigned to the worker.
     *
     * @param event The error event.
     */
    private _handleWorkerError(event: ErrorEvent) {
        const { target: worker, error } = event;

        const processingTaskId = this._workerTask.get(worker as Worker);

        if (processingTaskId) {
            // If the task is currently being executed by the worker, cancel it.
            this.cancelTask(processingTaskId, error as E);
        } else {
            // Otherwise, just replace the worker with a new one.
            this._replaceWorker(worker as Worker);
        }
    }

    /**
     * Replaces a worker in the pool with a new worker.
     * If an error is provided, it will be passed to the result handler of any pending task assigned to the worker being replaced.
     * @param worker - The worker to be replaced.
     * @param error - Optional error to be passed to the result handler of pending tasks.
     */
    private _replaceWorker(worker: Worker) {
        const workerIndex = this._workers.indexOf(worker);

        // If the worker is not in the pool, there is nothing to do.
        if (workerIndex < 0) {
            return;
        }

        // Otherwise, replace the worker with a new one.
        this._workers.splice(workerIndex, 1);
        this._workers.push(this._newBindedWorker());

        // If the worker had no task assigned, there is nothing to do.
        if (this._workerTask.has(worker)) {
            this._workerTask.delete(worker);
        }
    }

    /**
     * Returns the next available worker from the pool.
     * A worker is considered available if it is not currently assigned to a task.
     *
     * @returns The next available worker, or undefined if no worker is available.
     */
    private _nextFreeWorker() {
        return this._workers.find((w) => !this._workerTask.has(w));
    }
}
