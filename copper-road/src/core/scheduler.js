// Event queue: a binary min-heap stored as a plain array of plain objects,
// so it serialises with the rest of the state.
//
// Events are ordered by time, then by the sequence number they were scheduled
// with. Equal-time events therefore run in the order they were scheduled, on
// every machine.
//
// There is no cancel(). Handlers check a token (e.g. a trip number) carried in
// the event data and ignore events that no longer apply.

function before(a, b) {
  return a.t < b.t || (a.t === b.t && a.seq < b.seq);
}

export function heapPush(heap, ev) {
  heap.push(ev);
  let i = heap.length - 1;
  while (i > 0) {
    const parent = (i - 1) >> 1;
    if (!before(heap[i], heap[parent])) break;
    const tmp = heap[i];
    heap[i] = heap[parent];
    heap[parent] = tmp;
    i = parent;
  }
}

export function heapPop(heap) {
  if (!heap.length) return undefined;
  const top = heap[0];
  const last = heap.pop();
  if (heap.length) {
    heap[0] = last;
    let i = 0;
    for (;;) {
      const l = 2 * i + 1;
      const r = l + 1;
      let m = i;
      if (l < heap.length && before(heap[l], heap[m])) m = l;
      if (r < heap.length && before(heap[r], heap[m])) m = r;
      if (m === i) break;
      const tmp = heap[i];
      heap[i] = heap[m];
      heap[m] = tmp;
      i = m;
    }
  }
  return top;
}
