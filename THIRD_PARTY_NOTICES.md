# Third-party notices

This project includes modified code derived from these upstream works:

- [`diff-match-patch-es`](https://github.com/antfu/diff-match-patch-es), version 2.0.1 (commit
  [`4f35fb7fd57df68d69068cdee0780bb779f5497f`](https://github.com/antfu/diff-match-patch-es/commit/4f35fb7fd57df68d69068cdee0780bb779f5497f)),
  Anthony Fu's ESM and TypeScript rewrite of Google Diff Match Patch.
- Google's [`diff-match-patch`](https://github.com/google/diff-match-patch), copyright 2018 The diff-match-patch
  Authors. The original implementation was authored by Neil Fraser for Google Inc. See its upstream `AUTHORS` file for
  the other contributors.

The derived portions remain available under the Apache License, Version 2.0. A copy is provided in
[`LICENSES/Apache-2.0.txt`](LICENSES/Apache-2.0.txt).

The code has been modified for this project. Material changes include retaining only the relevant diff and cleanup
functionality, operating on generic token sequences, using `Intl.Segmenter` for grapheme and word segmentation, and
removing the upstream timeout and encoded line-identifier limits. The resulting API and implementation are not drop-in
compatible with `diff-match-patch-es` or Google Diff Match Patch.

The rest of this project is distributed under the project's MIT license. See [`LICENSE`](LICENSE).
