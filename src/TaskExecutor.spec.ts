import { describe, it, vi, expect, beforeEach } from 'vitest';
import { Task, TaskExecutor } from './TaskExecutor';

const execTask = vi.fn();

class MyTaskExecutor extends TaskExecutor<number, string> {
    protected _runTask(task: Task<number>): boolean {
        execTask(task);

        setImmediate(() => {
            this._handleTaskResult({
                id: task.id,
                data: `${task.data}-${task.data}`,
            });
        });

        return true;
    }
}

class MyBusyTaskExecutor extends TaskExecutor<number, string> {
    protected _runTask(task: Task<number>): boolean {
        execTask(task);
        return false;
    }
}

describe('MyTaskExecutor', () => {
    beforeEach(() => {
        execTask.mockClear();
    });

    describe('executeTask()', () => {
        let taskExecutor: MyTaskExecutor;

        beforeEach(() => {
            taskExecutor = new MyTaskExecutor();
        });

        it('should call runTask() with the next task in the queue', async () => {
            const { promise } = taskExecutor.executeTask(1);

            const result = await promise;

            expect(execTask).toHaveBeenCalledWith({
                id: expect.any(String),
                data: 1,
            });

            expect(result).toEqual('1-1');
        });

        it('should run the tasks in the order they were scheduled', async () => {
            taskExecutor.executeTask(1);
            taskExecutor.executeTask(2);
            taskExecutor.executeTask(3);
            taskExecutor.executeTask(4);
            taskExecutor.executeTask(5);

            expect(execTask).toHaveBeenNthCalledWith(1, {
                id: expect.any(String),
                data: 1,
            });
            expect(execTask).toHaveBeenNthCalledWith(2, {
                id: expect.any(String),
                data: 2,
            });
            expect(execTask).toHaveBeenNthCalledWith(3, {
                id: expect.any(String),
                data: 3,
            });
            expect(execTask).toHaveBeenNthCalledWith(4, {
                id: expect.any(String),
                data: 4,
            });
            expect(execTask).toHaveBeenNthCalledWith(5, {
                id: expect.any(String),
                data: 5,
            });
        });
    });

    describe('cancelTask()', () => {
        let taskExecutor: MyBusyTaskExecutor;

        beforeEach(() => {
            taskExecutor = new MyBusyTaskExecutor();
        });

        it('should cancel a task that is in the queue', async () => {
            const { id, promise } = taskExecutor.executeTask(1);

            taskExecutor.cancelTask(id);

            await expect(promise).rejects.toThrowErrorMatchingInlineSnapshot(
                '"Task cancelled by user"',
            );
        });
    });
});
