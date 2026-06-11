import { describe, expect, it } from 'vitest';
import {
  addFieldFromTemplate,
  addFieldLike,
  applyValueEdit,
  copyNode,
  getValueEdits,
  moveNode,
  parseJsonc,
  renameObjectKey,
  setLeadingComment,
  setTrailingComment,
} from './jsoncParser';

const sample = `{
  // keep this comment
  "name": "old",
  "items": [
    {
      "id": "first",
      "label": "First"
    },
    {
      "id": "second",
      "label": "Second"
    }
  ]
}`;

const dimensionSample = `{
  "dimensions": [
    {
      "id": "favor",
      "name": "圣宠值",
      "description": "皇帝对你的宠爱程度，影响你在后宫的地位和安全",
      "scope": "{{player}}受皇帝恩宠",
      "range": [0, 100],
      "initial": [5, 15]
    }
  ]
}`;

describe('jsoncParser', () => {
  it('parses object and array values for form rendering', () => {
    const { root, errors } = parseJsonc(sample);

    expect(errors).toHaveLength(0);
    expect(root?.type).toBe('object');
    expect(root?.children.find((child) => child.key === 'items')?.value).toEqual([
      { id: 'first', label: 'First' },
      { id: 'second', label: 'Second' },
    ]);
  });

  it('creates local edits for scalar changes instead of full document replacement', () => {
    const edits = getValueEdits(sample, ['name'], 'new');
    const next = applyValueEdit(sample, ['name'], 'new');

    expect(edits).toHaveLength(1);
    expect(edits[0].length).toBeLessThan(sample.length / 2);
    expect(next).toContain('// keep this comment');
    expect(next).toContain('"name": "new"');
  });

  it('renames object keys without changing the value or sibling formatting', () => {
    const { newText, newPath } = renameObjectKey(sample, ['name'], 'title');

    expect(newPath).toEqual(['title']);
    expect(newText).toContain('"title": "old"');
    expect(newText).not.toContain('"name": "old"');
    expect(newText).toContain('// keep this comment');
  });

  it('duplicates the current array element structure after the source element', () => {
    const { newText, newPath } = addFieldLike(sample, ['items', 0]);

    expect(newPath).toEqual(['items', 1]);
    expect(newText.indexOf('"id": "first"')).toBeLessThan(newText.indexOf('"id": "second"'));
    expect(newText.match(/"id": "first"/g)).toHaveLength(2);
  });

  it('copies an object property with a unique editable key', () => {
    const text = `{
  "first": "a",
  "second": "b",
  "third": "c"
}`;
    const { newText, newPath } = copyNode(text, [], 'second', true);
    const root = parseJsonc(newText).root;

    expect(newPath).toEqual(['second_2']);
    expect(root?.children.map((child) => child.key)).toEqual([
      'first',
      'second',
      'second_2',
      'third',
    ]);
    expect(newText).toContain('"second_2": "b"');
  });

  it('copies an array element directly after the source element', () => {
    const { newText, newPath } = copyNode(sample, ['items'], 0, false);
    const items = parseJsonc(newText).root
      ?.children.find((child) => child.key === 'items')
      ?.value;

    expect(newPath).toEqual(['items', 1]);
    expect(items).toEqual([
      { id: 'first', label: 'First' },
      { id: 'first', label: 'First' },
      { id: 'second', label: 'Second' },
    ]);
  });

  it('preserves trailing comments when copying an object property', () => {
    const text = `{
  "id": "favor", // ID
  "name": "圣宠值", // 名字
  "description": "说明"
}`;
    const { newText } = copyNode(text, [], 'id', true);
    // jsonc.modify transfers the trailing comment to the new property
    expect(newText).toContain('"id_2": "favor"');
    expect(newText).toMatch(/"id_2"[^\n]*\/\/ ID/);
    expect(newText).toContain('"name": "圣宠值", // 名字');
  });

  it('preserves trailing comments when copying an array element', () => {
    const text = `{
  "items": [
    "alpha", // first
    "beta"
  ]
}`;
    const { newText } = copyNode(text, ['items'], 0, false);
    // Both the original and the copy should have the trailing comment
    const root = parseJsonc(newText).root;
    const items = root?.children.find((c) => c.key === 'items');
    expect(items?.value).toHaveLength(3);
    const elem0 = items?.children?.[0];
    const elem1 = items?.children?.[1];
    expect(elem0?.comments).toContainEqual(expect.objectContaining({ position: 'trailing', content: 'first' }));
    expect(elem1?.comments).toContainEqual(expect.objectContaining({ position: 'trailing', content: 'first' }));
  });

  it('preserves internal trailing comments when copying a multi-line array element', () => {
    const text = `{
  "items": [
    {
      "id": "a", // comment-a
      "name": "alpha" // name-a
    }
  ]
}`;
    const { newText } = copyNode(text, ['items'], 0, false);
    // The new element should also have the trailing comments
    const root = parseJsonc(newText).root;
    const items = root?.children.find((c) => c.key === 'items');
    expect(items?.value).toHaveLength(2);
    // Check that the new element has comments
    const elem1 = items?.children?.[1];
    const idField = elem1?.children?.find((c: any) => c.key === 'id');
    const nameField = elem1?.children?.find((c: any) => c.key === 'name');
    expect(idField?.comments.some((c: any) => c.position === 'trailing' && c.content === 'comment-a')).toBe(true);
    expect(nameField?.comments.some((c: any) => c.position === 'trailing' && c.content === 'name-a')).toBe(true);
  });

  it('formats copied object fields onto their own lines', () => {
    const text = `{
  "rules": {
    "requirements": [
      "one",
      "two"
    ]
  }
}`;

    const { newText } = addFieldLike(text, ['rules', 'requirements']);

    expect(newText).toContain('],\n    "requirements_2"');
    expect(newText).not.toContain('],    "requirements_2"');
  });

  it('moves adjacent nodes without serializing the whole parent', () => {
    const { newText, newPath } = moveNode(sample, ['items', 1], -1);

    expect(newPath).toEqual(['items', 0]);
    expect(newText.indexOf('"id": "second"')).toBeLessThan(newText.indexOf('"id": "first"'));
    expect(newText).toContain('      "label": "Second"');
  });

  it('keeps CRLF files uniform when moving object properties', () => {
    const crlf = sample.replace(/\n/g, '\r\n');
    const { newText } = moveNode(crlf, ['items', 0, 'label'], -1);
    const moved = parseJsonc(newText).root
      ?.children.find((child) => child.key === 'items')
      ?.children[0];

    expect(newText).not.toMatch(/[^\r]\n/);
    expect(moved?.children.map((child) => child.key)).toEqual([
      'label',
      'id',
    ]);
  });

  it('keeps the moved game config field visible in source and parsed form order', () => {
    const { newText } = moveNode(dimensionSample, ['dimensions', 0, 'name'], 1);
    const dimension = parseJsonc(newText).root
      ?.children.find((child) => child.key === 'dimensions')
      ?.children[0];

    expect(newText).toContain('"name": "圣宠值"');
    expect(newText.indexOf('"description"')).toBeLessThan(newText.indexOf('"name"'));
    expect(dimension?.children.map((child) => child.key)).toEqual([
      'id',
      'description',
      'name',
      'scope',
      'range',
      'initial',
    ]);
  });

  it('associates JSONC comments with nearby form fields', () => {
    const text = `{
  // label shown in UI
  "name": "old",
  "power": 10 // combat score
}`;

    const root = parseJsonc(text).root;
    const name = root?.children.find((child) => child.key === 'name');
    const power = root?.children.find((child) => child.key === 'power');

    expect(name?.comments).toContainEqual(expect.objectContaining({
      position: 'leading',
      content: 'label shown in UI',
    }));
    expect(power?.comments).toContainEqual(expect.objectContaining({
      position: 'trailing',
      content: 'combat score',
    }));
  });

  it('inserts and clears leading comments without rewriting the document', () => {
    const text = '{\r\n  "name": "old"\r\n}';
    const withComment = setLeadingComment(text, ['name'], 'designer note');
    const cleared = setLeadingComment(withComment, ['name'], '');

    expect(withComment).toContain('  // designer note\r\n  "name": "old"');
    expect(withComment).not.toMatch(/[^\r]\n/);
    expect(cleared).toBe(text);
  });

  it('inserts and clears trailing comments after property commas', () => {
    const text = '{\r\n  "name": "old",\r\n  "level": 1\r\n}';
    const withComment = setTrailingComment(text, ['name'], 'designer note');
    const cleared = setTrailingComment(withComment, ['name'], '');

    expect(withComment).toContain('  "name": "old", // designer note\r\n');
    expect(withComment).not.toMatch(/[^\r]\n/);
    expect(parseJsonc(withComment).errors).toHaveLength(0);
    expect(cleared).toBe(text);
  });

  it('updates existing trailing comments in place', () => {
    const text = '{\n  "name": "old" // old note\n}';
    const updated = setTrailingComment(text, ['name'], 'new note');

    expect(updated).toContain('"name": "old" // new note');
    expect(updated).not.toContain('old note');
  });

  it('does not bleed trailing comments into the next property as leading comments', () => {
    const text = `{
  "id": "favor", // ID
  "name": "圣宠值", // 名字
  "description": "皇帝对你的宠爱程度"
}`;
    const root = parseJsonc(text).root;
    const id = root?.children.find((child) => child.key === 'id');
    const name = root?.children.find((child) => child.key === 'name');
    const desc = root?.children.find((child) => child.key === 'description');

    // id should have trailing "ID", no leading
    expect(id?.comments).toContainEqual(expect.objectContaining({ position: 'trailing', content: 'ID' }));
    expect(id?.comments.filter((c) => c.position === 'leading')).toHaveLength(0);

    // name should have trailing "名字", no leading
    expect(name?.comments).toContainEqual(expect.objectContaining({ position: 'trailing', content: '名字' }));
    expect(name?.comments.filter((c) => c.position === 'leading')).toHaveLength(0);

    // description should have NO comments at all
    expect(desc?.comments).toHaveLength(0);
  });

  it('collects genuine leading comments that sit on their own line', () => {
    const text = `{
  // this is a leading note
  "name": "old",
  "power": 10
}`;
    const root = parseJsonc(text).root;
    const name = root?.children.find((child) => child.key === 'name');
    const power = root?.children.find((child) => child.key === 'power');

    expect(name?.comments).toContainEqual(expect.objectContaining({ position: 'leading', content: 'this is a leading note' }));
    expect(power?.comments).toHaveLength(0);
  });

  it('keeps first element leading comment on the element when no blank line', () => {
    const text = `{
  "dimensions": [
    // 赛季
    {
      "id": "favor",
      "name": "圣宠值"
    }
  ]
}`;
    const root = parseJsonc(text).root;
    const dims = root?.children.find((child) => child.key === 'dimensions');
    const elem0 = dims?.children?.[0];

    // No blank line → comment stays on the first element
    expect(elem0?.comments).toContainEqual(
      expect.objectContaining({ position: 'leading', content: '赛季' })
    );
    // Array should NOT have the comment
    expect(dims?.comments.filter((c) => c.content === '赛季')).toHaveLength(0);
  });

  it('transfers first element leading comment to array when blank line separates them', () => {
    const text = `{
  "dimensions": [
    // 赛季配置

    {
      "id": "favor",
      "name": "圣宠值"
    }
  ]
}`;
    const root = parseJsonc(text).root;
    const dims = root?.children.find((child) => child.key === 'dimensions');
    const elem0 = dims?.children?.[0];

    // Blank line → comment transferred to array node
    expect(dims?.comments).toContainEqual(
      expect.objectContaining({ position: 'leading', content: '赛季配置' })
    );
    expect(elem0?.comments.filter((c) => c.content === '赛季配置')).toHaveLength(0);
  });

  it('collects trailing comment on array bracket as array trailing comment', () => {
    const text = `{
  "dimensions": [ // 赛季
    { "id": "favor" }
  ]
}`;
    const root = parseJsonc(text).root;
    const dims = root?.children.find((child) => child.key === 'dimensions');

    expect(dims?.comments).toContainEqual(
      expect.objectContaining({ position: 'trailing', content: '赛季' })
    );
  });

  it('keeps inter-element comments on their respective elements', () => {
    const text = `{
  "dimensions": [
    { "id": "a" },
    // between 0 and 1
    { "id": "b" },
    // between 1 and 2
    { "id": "c" }
  ]
}`;
    const root = parseJsonc(text).root;
    const dims = root?.children.find((child) => child.key === 'dimensions');
    const elem1 = dims?.children?.[1];
    const elem2 = dims?.children?.[2];

    // Inter-element comments stay on their elements
    expect(elem1?.comments).toContainEqual(
      expect.objectContaining({ position: 'leading', content: 'between 0 and 1' })
    );
    expect(elem2?.comments).toContainEqual(
      expect.objectContaining({ position: 'leading', content: 'between 1 and 2' })
    );
    // Array should NOT have these comments
    expect(dims?.comments.filter((c) => c.content.startsWith('between'))).toHaveLength(0);
  });

  it('adds array elements from a neutral field template instead of cloning values', () => {
    const text = `{
  "items": [
    {
      "id": "sword_001",
      "enabled": true,
      "power": 25,
      "tags": ["rare"],
      "meta": {
        "description": "starter weapon"
      }
    }
  ]
}`;

    const { newText, newPath } = addFieldFromTemplate(text, ['items'], ['items', 0]);
    const items = parseJsonc(newText).root
      ?.children.find((child) => child.key === 'items')
      ?.value;

    expect(newPath).toEqual(['items', 1]);
    expect(items).toEqual([
      {
        id: 'sword_001',
        enabled: true,
        power: 25,
        tags: ['rare'],
        meta: { description: 'starter weapon' },
      },
      {
        id: '',
        enabled: false,
        power: 0,
        tags: [''],
        meta: { description: '' },
      },
    ]);
  });

  it('moves leading comments together with array elements when swapping', () => {
    const text = `[
  // comment for A
  { "id": "a" },
  // comment for B
  { "id": "b" },
  // comment for C
  { "id": "c" }
]`;

    // Move element at index 1 (B) up → should become index 0
    const { newText, newPath } = moveNode(text, [1], -1);
    expect(newPath).toEqual([0]);
    // B should now come before A, and its leading comment moved with it
    expect(newText.indexOf('// comment for B')).toBeLessThan(newText.indexOf('// comment for A'));
    expect(newText.indexOf('// comment for B')).toBeLessThan(newText.indexOf('"id": "b"'));
    expect(newText.indexOf('"id": "b"')).toBeLessThan(newText.indexOf('"id": "a"'));
    // C's comment stays with C (now at index 2)
    expect(newText.indexOf('// comment for C')).toBeLessThan(newText.indexOf('"id": "c"'));
  });

  it('moves leading comments together with array elements when moving down', () => {
    const text = `[
  // comment A
  { "id": "a" },
  // comment B
  { "id": "b" }
]`;

    // Move element at index 0 (A) down → should become index 1
    const { newText, newPath } = moveNode(text, [0], 1);
    expect(newPath).toEqual([1]);
    // B should come first now, then A (with A's leading comment)
    expect(newText.indexOf('"id": "b"')).toBeLessThan(newText.indexOf('// comment A'));
    expect(newText.indexOf('// comment A')).toBeLessThan(newText.indexOf('"id": "a"'));
  });

  it('preserves element data unchanged when moving with leading comments', () => {
    const text = `[
  // A desc
  { "id": "a", "val": 1 },
  // B desc
  { "id": "b", "val": 2 }
]`;

    const { newText } = moveNode(text, [1], -1);
    const root = parseJsonc(newText).root;
    expect(root?.children).toHaveLength(2);
    // Both elements should still have correct data
    expect(root?.children[0].value).toEqual({ id: 'b', val: 2 });
    expect(root?.children[1].value).toEqual({ id: 'a', val: 1 });
    // Leading comments should associate with their elements
    const elem0 = root?.children[0];
    const elem1 = root?.children[1];
    expect(elem0?.comments).toContainEqual(expect.objectContaining({ position: 'leading', content: 'B desc' }));
    expect(elem1?.comments).toContainEqual(expect.objectContaining({ position: 'leading', content: 'A desc' }));
  });

  it('also moves leading comments when swapping object properties', () => {
    const text = `{
  // section A
  "alpha": 1,
  // section B
  "beta": 2
}`;

    const { newText } = moveNode(text, ['alpha'], 1);
    // Beta should come first, its leading comment moves with it
    expect(newText.indexOf('// section B')).toBeLessThan(newText.indexOf('"beta"'));
    expect(newText.indexOf('"beta"')).toBeLessThan(newText.indexOf('"alpha"'));
    // Alpha's leading comment moves with it
    expect(newText.indexOf('// section A')).toBeLessThan(newText.indexOf('"alpha"'));
  });

  it('collects trailing comment on array element object as element trailing comment', () => {
    const text = `{
  "dimensions": [
    { "id": "a" }, // comment on a
    { "id": "b" }
  ]
}`;

    const root = parseJsonc(text).root;
    const dims = root?.children.find((child) => child.key === 'dimensions');
    const elem0 = dims?.children?.[0];
    const elem1 = dims?.children?.[1];

    // First element should have trailing comment
    expect(elem0?.comments).toContainEqual(expect.objectContaining({ position: 'trailing', content: 'comment on a' }));
    // Second element should have no comments
    expect(elem1?.comments).toHaveLength(0);
  });

  it('collects trailing comment on multi-line array element object', () => {
    const text = `[
    {
      "id": "favor",
      "name": "圣宠值"
    }, // 赛季
    {
      "id": "blessing",
      "name": "祝福值"
    }, // 祝福
]`;

    const root = parseJsonc(text).root;
    const elem0 = root?.children?.[0];
    const elem1 = root?.children?.[1];

    expect(elem0?.comments).toContainEqual(expect.objectContaining({ position: 'trailing', content: '赛季' }));
    expect(elem1?.comments).toContainEqual(expect.objectContaining({ position: 'trailing', content: '祝福' }));
  });

  it('handles mixed case: one element has leading comment, the other does not', () => {
    const text = `[
  // only A has comment
  { "id": "a" },
  { "id": "b" }
]`;

    const { newText } = moveNode(text, [0], 1);
    // B moves up, no leading comment for B
    expect(newText.indexOf('"id": "b"')).toBeLessThan(newText.indexOf('"id": "a"'));
    // A's leading comment should move with A down
    expect(newText.indexOf('// only A has comment')).toBeLessThan(newText.indexOf('"id": "a"'));
    // A's leading comment should be after B
    expect(newText.indexOf('"id": "b"')).toBeLessThan(newText.indexOf('// only A has comment'));
  });
});
