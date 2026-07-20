const assert = require("node:assert/strict");
const test = require("node:test");

const {
  AdjustableRequestScheduler,
} = require("../dist/electron/utils/adjustableRequestScheduler.js");

const nextTurn = () => new Promise((resolve) => setImmediate(resolve));

test("applies one hard concurrency limit across every request group", async () => {
  const scheduler = new AdjustableRequestScheduler(2);
  const releaseA = await scheduler.acquire({ groupKey: "a" });
  const releaseB = await scheduler.acquire({ groupKey: "b" });
  let thirdStarted = false;
  const third = scheduler.acquire({ groupKey: "c" }).then((release) => {
    thirdStarted = true;
    return release;
  });

  await nextTurn();
  assert.equal(scheduler.active, 2);
  assert.equal(scheduler.pending, 1);
  assert.equal(thirdStarted, false);

  releaseA();
  const releaseC = await third;
  assert.equal(thirdStarted, true);
  assert.equal(scheduler.active, 2);

  releaseB();
  releaseC();
  assert.equal(scheduler.active, 0);
});

test("honors per-scraper concurrency without reserving global slots", async () => {
  const scheduler = new AdjustableRequestScheduler(2);
  const releaseA1 = await scheduler.acquire({ groupKey: "a", groupMaxConcurrent: 1 });
  let a2Started = false;
  const a2 = scheduler.acquire({ groupKey: "a", groupMaxConcurrent: 1 }).then((release) => {
    a2Started = true;
    return release;
  });
  const releaseB = await scheduler.acquire({ groupKey: "b", groupMaxConcurrent: 1 });

  assert.equal(scheduler.active, 2);
  assert.equal(a2Started, false);
  releaseA1();
  const releaseA2 = await a2;
  assert.equal(a2Started, true);

  releaseA2();
  releaseB();
});

test("prioritizes interactive work over queued background work", async () => {
  const scheduler = new AdjustableRequestScheduler(1);
  const releaseRunning = await scheduler.acquire({ priority: 0 });
  const order = [];
  const background = scheduler.acquire({ priority: 0 }).then((release) => {
    order.push("background");
    return release;
  });
  const interactive = scheduler.acquire({ priority: 10 }).then((release) => {
    order.push("interactive");
    return release;
  });

  releaseRunning();
  const releaseInteractive = await interactive;
  assert.deepEqual(order, ["interactive"]);
  releaseInteractive();
  const releaseBackground = await background;
  assert.deepEqual(order, ["interactive", "background"]);
  releaseBackground();
});

test("adjusts the global limit without interrupting active requests", async () => {
  const scheduler = new AdjustableRequestScheduler(3);
  const releases = await Promise.all([
    scheduler.acquire(),
    scheduler.acquire(),
    scheduler.acquire(),
  ]);
  scheduler.setLimit(1);

  let queuedStarted = false;
  const queued = scheduler.acquire().then((release) => {
    queuedStarted = true;
    return release;
  });
  releases[0]();
  releases[1]();
  await nextTurn();
  assert.equal(queuedStarted, false);

  releases[2]();
  const releaseQueued = await queued;
  assert.equal(queuedStarted, true);
  assert.equal(scheduler.active, 1);
  releaseQueued();
  releaseQueued();
  assert.equal(scheduler.active, 0);
});

test("paces starts for the same scraper while allowing another scraper through", async () => {
  const scheduler = new AdjustableRequestScheduler(2);
  const releaseA = await scheduler.acquire({ groupKey: "a", minDelayMs: 35 });
  releaseA();
  let secondAStartedAt = 0;
  const start = Date.now();
  const secondA = scheduler.acquire({ groupKey: "a", minDelayMs: 35 }).then((release) => {
    secondAStartedAt = Date.now();
    return release;
  });
  const releaseB = await scheduler.acquire({ groupKey: "b", minDelayMs: 35 });

  assert.equal(secondAStartedAt, 0);
  releaseB();
  const releaseSecondA = await secondA;
  assert.ok(secondAStartedAt - start >= 25);
  releaseSecondA();
});
