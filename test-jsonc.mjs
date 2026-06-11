import * as jsonc from 'jsonc-parser';

const text = '{"name":"test","age":25,"nested":{"key":"val"},"arr":[1,2,3]}';
const errors = [];
const node = jsonc.parseTree(text, errors);

function buildNodeInfo(node, text, path) {
  const type = node.type === 'property' ? 'property' : node.type;
  const info = {
    path: [...path],
    key: path.length > 0 ? path[path.length - 1] : undefined,
    value: type === 'object' || type === 'array' ? undefined : extractValue(node, text),
    type,
    children: [],
  };

  if (node.type === 'object' && node.children) {
    for (const propNode of node.children) {
      if (propNode.type !== 'property' || !propNode.children || propNode.children.length < 2) continue;
      const keyNode = propNode.children[0];
      const valNode = propNode.children[1];
      const key = extractValue(keyNode, text);
      info.children.push(buildNodeInfo(valNode, text, [...path, key]));
    }
  } else if (node.type === 'array' && node.children) {
    info.children = node.children.map((child, idx) =>
      buildNodeInfo(child, text, [...path, idx])
    );
  }

  return info;
}

function extractValue(node, text) {
  const raw = text.substring(node.offset, node.offset + node.length);
  switch (node.type) {
    case 'string': return raw.slice(1, -1);
    case 'number': return Number(raw);
    case 'boolean': return raw === 'true';
    case 'null': return null;
    default: return undefined;
  }
}

if (node) {
  const result = buildNodeInfo(node, text, []);
  console.log('Root type:', result.type);
  console.log('Root children:', result.children.length);
  for (const child of result.children) {
    console.log(`  key:"${child.key}" type:${child.type} value:${child.value} children:${child.children.length}`);
  }
}
