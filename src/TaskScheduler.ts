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
export abstract class TaskScheduler<I, O, E extends Error = Error> {
    protected readonly _taskQueue: Task<I>[] = [];
    protected readonly _resultHandlers: Map<TaskId, TaskResultHandler<O, E>> =
        new Map();

    /**
     * Executes a task in the task scheduler.
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
     * Cancels a task in the task scheduler.
     * If the task is in the queue, it will be removed.
     * If the task is currently being executed, the execution will be stopped.
     *
     * @param taskId The ID of the task to cancel.
     */
    public cancelTask(taskId: TaskId): void {
        const taskIndex = this._taskQueue.findIndex(
            (task) => task.id === taskId,
        );

        if (taskIndex !== -1) {
            this._taskQueue.splice(taskIndex, 1);
        } else {
            this._resultHandlers.delete(taskId);
        }
    }

    /**
     * Abstract method to be implemented by the concrete class.
     * This method should schedule the execution of the next task.
     */
    protected abstract scheduleTask(): void;
}
