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
});
