export type DiffPart =
  | { readonly type: 'delete'; readonly value: string }
  | { readonly type: 'equal'; readonly value: string }
  | { readonly type: 'insert'; readonly value: string };

export const diffText = (before: string, after: string): readonly DiffPart[] => {
  if (before === after) {
    return before === '' ? [] : [{ type: 'equal', value: before }];
  }

  const parts: DiffPart[] = [];

  if (before !== '') {
    parts.push({ type: 'delete', value: before });
  }

  if (after !== '') {
    parts.push({ type: 'insert', value: after });
  }

  return parts;
};
