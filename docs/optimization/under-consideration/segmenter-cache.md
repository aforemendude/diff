# Optimization: bounded `Intl.Segmenter` reuse

## Review result

On hold. The implementation needs substantial tuning, while the observed performance difference is too small to justify
that work at this time.

## Summary

Creating `Intl.Segmenter` can be a substantial part of short grapheme diff and semantic-cleanup calls. Segmenter objects
are reusable, so a small bounded cache can amortize construction while continuing to delegate every boundary decision to
the runtime.

The cache policy is the complex part: locale arguments are not always immutable scalar strings, the omitted locale uses
host defaults, invalid locales must still throw, and an unbounded map would turn user-controlled locales into retained
memory.

## Evidence

The exploratory measurements below were collected on Node.js 24.18.0; constructor and iterator costs vary by engine.

New segmenters are constructed in [`diffGraphemes`](../../../src/diff/grapheme.ts),
[`tokenizeGraphemes`](../../../src/tokenize/graphemes.ts), and [`cleanupSemantic`](../../../src/cleanup/semantic.ts).

On the local Node runtime, constructing an English grapheme segmenter cost roughly 8-9 microseconds. At the time of the
prototype, the short mixed-Unicode diff benchmark cost roughly 28-34 microseconds per call, so construction was a
material fraction. The prototype measured:

| Short-call variant                 | Approximate time |
| ---------------------------------- | ---------------- |
| New segmenter plus `Array.from`    | 28-30 us         |
| Cached segmenter plus `Array.from` | 16-18 us         |
| Cached segmenter plus a push loop  | 12-15 us         |

These figures predate the current `for...of` push loop in `tokenizeGraphemesWithSegmenter`; the table does not contain a
new-segmenter-plus-push-loop baseline. They are directional and engine-specific, so the current implementation, browser
engines, and supported Node versions need independent measurements before this proposal is resumed.

## Recommended first stage

Cache only calls with an explicit scalar locale string. Use a tiny LRU, such as four or eight entries, keyed by:

```text
granularity + "\0" + localeString
```

Keep grapheme and word segmenters distinct. On a miss, call `new Intl.Segmenter` normally and insert the object only
after construction succeeds. A hit returns the existing immutable-configuration object.

This conservative scope handles the common `{ locale: 'en' }` pattern while avoiding the hardest identity questions:

- Locale arrays are caller-owned and can be mutated between calls, so do not cache them by reference.
- An omitted locale asks the runtime to choose its default. Do not freeze that choice in a long-lived cache until the
  supported hosts' default-locale stability is explicitly accepted as part of the contract.
- Failed construction is not cached, so invalid locale strings continue to throw.

A one-entry most-recent cache is even simpler and prevents memory growth entirely. Benchmark it against the small LRU on
alternating-locale workloads.

## Broader cache, if needed

Locale arrays can be supported by canonicalizing their current contents on every call and using an immutable serialized
key. That must be measured because canonicalization has its own cost; a local `Intl.getCanonicalLocales('en')` call was
about 1 microsecond, much less than construction but significant for very short inputs.

Before adopting this stage, verify that canonicalization and construction reject the same inputs in every supported
runtime and decide whether observable error details are part of the compatibility target. Never use array identity as
the key.

## Correctness and lifecycle constraints

- Always call the selected segmenter's `segment`; do not replace segmentation with an ASCII splitter. ECMA-402 permits
  implementation- and locale-dependent boundary behavior.
- Key every option that affects segmentation. Today that is locale plus `granularity`; future options must be added to
  the key.
- Bound retained entries, including uncommon but valid locale tags supplied by untrusted callers.
- Keep the cache module-local. Do not expose mutable segmenters through the public API.
- JavaScript execution of `segment()` is synchronous and segmenter configuration is immutable, so sequential reuse does
  not share an iterator or per-call cursor. Each `segment(text)` call returns a new `Segments` object.
- Preserve segmenter acquisition before every equal/empty grapheme fast path. In particular, a supplied invalid locale
  must continue to throw even when the text itself is trivial.

## Tests

- Two consecutive calls with the same explicit string locale construct once and produce valid diffs.
- Alternating locales cannot cross-contaminate boundaries.
- Grapheme and word granularities never share a cache entry.
- More distinct locales than capacity evict old entries and keep the cache bounded.
- Invalid strings throw on every call and never occupy a slot.
- Mutating a locale array between calls changes the effective request; the conservative first stage simply bypasses the
  cache for both calls.
- Equal and empty inputs still validate their locale.

Constructor-spy tests should isolate the module or use a locale not already cached; otherwise earlier tests make call
counts order-dependent.

## Benchmarks

Measure short and long inputs with:

- one repeated explicit locale;
- two alternating locales;
- more locales than the cache capacity;
- omitted locale;
- mutable locale arrays that bypass the cache;
- grapheme diff and semantic cleanup separately.

Long inputs should remain neutral because segmentation dominates. Reject the cache if hit bookkeeping measurably
regresses that path or if supported browser engines show no short-call benefit.

## Rollout

Manual grapheme segment iteration has already landed. If this proposal is resumed, benchmark a one-entry cache for
explicit locale strings against the current push-loop baseline. Expand to a small LRU or canonicalized arrays only with
workload evidence.
