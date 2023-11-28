# next-webworker-pool

[![.github/workflows/publish.yaml](https://github.com/iuliancmarcu/next-webworker-pool/actions/workflows/publish.yaml/badge.svg)](https://github.com/iuliancmarcu/next-webworker-pool/actions/workflows/publish.yaml)

A NPM package that enables developers to build Web Worker pools for Next.js applications.

## Installation

```bash
npm install next-webworker-pool
```

## Usage

### 1. Create a Web Worker file

This is the file that will be run inside the Web Worker.

```typescript
// my-worker.ts
import type { WebWorkerTask, WebWorkerResult } from 'next-webworker-pool';

type MyInput = number; // can be anything that the client will send
type MyOutput = number; // can be anything that the client will receive

self.onmessage = function (e: MessageEvent<WebWorkerTask<MyInput, MyOutput>>) {
    self.postMessage(runTask(e.data));
};

function runTask(
    task: WebWorkerTask<MyInput, MyOutput>,
): WebWorkerResult<MyInput> {
    const result = task.data + 1; // do something with the input

    return {
        id: task.id,
        data: result,
    };
}
```

### 2. Create a Web Worker pool by extending the `WebWorkerPool` class

This is a class that is responsible for creating Web Workers from a specific source, and running tasks on them.

This pattern is used, because Next.js scans the source code for `new Worker(new URL(...))` calls, and replaces
them with the Next.js custom bundling implementation.

```typescript
// my-worker-pool.ts
import { WebWorkerPool } from 'next-webworker-pool';

import type { MyInput, MyOutput } from './my-worker';

export class MyWorkerPool extends WebWorkerPool<MyInput, MyOutput> {
    createWorker(): Worker {
        return new Worker(new URL('./my-worker.ts', import.meta.url));
    }
}
```

### 3. Use the Web Worker pool in your Next.js application

To use the Web Worker pool, you need to create an instance of it, and call the `run` method with the input data.

```typescript
// pages/index.tsx
import { MyWorkerPool } from '../my-worker-pool';

export default function Home() {
    const [result, setResult] = useState<number | null>(null);

    useEffect(() => {
        // create a new instance of the Web Worker pool
        const pool = new MyWorkerPool();

        const task = pool.executeTask(1); // run the task with input 1

        // wait for the task to finish and use the result
        task.promise
            .then((result) => {
                setResult(result);
            })
            .catch((error) => {
                console.error(error);
            });

        return () => {
            // terminate the Web Worker pool when the component is unmounted
            pool.terminate();
        };
    }, []);

    return <div>{result}</div>;
}
```

## Options

### `maxWorkers`

The maximum number of Web Workers that can be created by the pool. Defaults to `navigator.hardwareConcurrency` or 4 if `hardwareConcurrency` is not supported.

```typescript
// my-worker-pool.ts

export class MyWorkerPool extends WebWorkerPool<MyInput, MyOutput> {
    constructor() {
        super({
            maxWorkers: 4,
        });
    }

    createWorker(): Worker {
        return new Worker(new URL('./my-worker.ts', import.meta.url));
    }
}
```
