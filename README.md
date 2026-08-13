# Diff

A small, typed text diff utility for Node.js.

## Requirements

- Node.js 20 or newer
- npm

## Installation

```bash
npm install @aforemendude/diff
```

## Usage

```typescript
import { diffText } from '@aforemendude/diff';

diffText('before', 'after');
// [
//   { type: 'delete', value: 'before' },
//   { type: 'insert', value: 'after' },
// ]
```

The initial implementation emits whole-text operations: equal inputs produce one `equal` part, while changed inputs
produce a `delete` part followed by an `insert` part. Empty parts are omitted.

## API

```typescript
diffText(before: string, after: string): readonly DiffPart[];
```

Each `DiffPart` has a `type` of `delete`, `equal`, or `insert`, along with its string `value`.

## Development

Development requires Node.js 22.12 or newer. The published library supports Node.js 20 or newer.

```bash
# Compile TypeScript
npm run build

# Check formatting, reusing cached results
npm run format:check

# Format code with Prettier, reusing cached results
npm run format

# Format code with Prettier and clear cached results
npm run format:nocache

# Run unit tests
npm run test

# Run tests in watch mode
npm run test:watch

# Run an uncached formatting check, compile, and test
npm run verify
```
