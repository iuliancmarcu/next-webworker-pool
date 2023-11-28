export type TaskId = string;

export interface TaskSuccess<T> {
    id: TaskId;
    data: T;
}

export interface TaskError<T> {
    id: TaskId;
    error: T;
}

export type TaskResult<T, E extends Error = Error> =
    | TaskSuccess<T>
    | TaskError<E>;

export type TaskResultHandler<T, E extends Error = Error> = (
    result: TaskResult<T, E>,
) => void;

export interface Task<T> {
    id: TaskId;
    data: T;
}
export abstract class TaskExecutor<I, O, E extends Error = Error> {
    private readonly _taskQueue: Task<I>[] = [];
    private readonly _resultHandlers: Map<TaskId, TaskResultHandler<O, E>> =
        new Map();

    /**
     * Executes a task in the task executor.
     *
     * @param data The input data for the task.
     * @returns A promise that resolves with the output of the task.
     */
    public executeTask(data: I): { id: TaskId; promise: Promise<O> } {
        const task: Task<I> = {
            id: crypto.randomUUID(),
            data,
        };

        const promise = new Promise<O>((resolve, reject) => {
            // Enqueue the task and register the result handler
            this._taskQueue.push(task);
            this._resultHandlers.set(task.id, (result) =>
                'error' in result ? reject(result.error) : resolve(result.data),
            );
        });

        // Try to schedule the next task
        this.scheduleTask();

        return { id: task.id, promise };
    }

    /**
     * Cancels a task in the task executor.
     * If the task is in the queue, it will be removed.
     * If the task is currently being executed, the execution will be stopped.
     *
     * @param taskId The ID of the task to cancel.
     */
    public cancelTask(taskId: TaskId, error?: E): void {
        const taskQueueIndex = this._taskQueue.findIndex(
            (task) => task.id === taskId,
        );

        if (taskQueueIndex !== -1) {
            this._taskQueue.splice(taskQueueIndex, 1);
        }

        this._handleTaskResult({
            id: taskId,
            error: error ?? (new Error('Task cancelled by user') as E),
        });

        this._resultHandlers.delete(taskId);
    }

    /**
     * Schedules the next task in the queue.
     * This method is called by the concrete class when necessary.
     */
    private scheduleTask() {
        // Take the next task from the queue
        const task = this._taskQueue.shift();

        if (task) {
            // Try to run the task
            const ran = this._runTask(task);

            // If the task didn't run, put it back in the queue
            if (!ran) {
                this._taskQueue.unshift(task);
            }
        }
    }

    protected _handleTaskResult(result: TaskResult<O, E>) {
        const handler = this._resultHandlers.get(result.id);

        if (handler) {
            handler(result);
            this._resultHandlers.delete(result.id);
        }

        // Try to schedule the next task
        this.scheduleTask();
    }

    /**
     * Abstract method to be implemented by the concrete class.
     * This method returns true if the task started executing, false otherwise.
     */
    protected abstract _runTask(task: Task<I>): boolean;
}
