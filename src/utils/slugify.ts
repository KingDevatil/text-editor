/**
 * Generate URL-friendly slugs from heading text, compatible with
 * common Markdown anchor conventions (GitHub-style).
 */
export function slugify(text: string): string {
  // Strip HTML tags
  let slug = text.replace(/<[^>]+>/g, '');
  // Remove common Chinese punctuation
  slug = slug.replace(/[、，。！？；：“”‘’（）【】《》]/g, '');
  // Replace spaces / full-width spaces with hyphens
  slug = slug.replace(/[\s\u3000]+/g, '-');
  // Remove other special chars, keep word chars and CJK chars
  slug = slug.replace(/[^\w\u4e00-\u9fa5-]/g, '');
  // Lowercase
  slug = slug.toLowerCase();
  // Trim leading / trailing hyphens
  slug = slug.replace(/^-+|-+$/g, '');
  return slug || 'heading';
}

export interface TocItem {
  level: number;
  text: string;
  id: string;
}

interface HeadingSlugResult {
  slugs: string[];
  htmlWithIds: string;
  tocItems: TocItem[];
}

/**
 * Parse marked HTML output, inject heading IDs, and return slugs + TOC.
 */
export function generateHeadingSlugs(html: string): HeadingSlugResult {
  const levels: number[] = [];
  const texts: string[] = [];

  // First pass: collect headings
  const regex = /<h([1-6])[^>]*>(.*?)<\/h[1-6]>/gi;
  let match;
  while ((match = regex.exec(html)) !== null) {
    levels.push(parseInt(match[1], 10));
    const stripped = match[2].replace(/<[^>]+>/g, '');
    const decoded = new DOMParser().parseFromString(stripped, 'text/html').body.textContent || '';
    texts.push(decoded);
  }

  // Generate unique slugs (GitHub-style dedup: foo, foo-1, foo-2...)
  const counts = new Map<string, number>();
  const slugs = texts.map((text) => {
    let slug = slugify(text);
    const count = counts.get(slug) || 0;
    counts.set(slug, count + 1);
    if (count > 0) {
      slug = `${slug}-${count}`;
    }
    return slug;
  });

  // Build TOC items
  const tocItems = levels.map((level, i) => ({
    level,
    text: texts[i],
    id: slugs[i],
  }));

  // Inject IDs into HTML
  let idx = 0;
  const htmlWithIds = html.replace(/<h([1-6])([^>]*)>/gi, (_m, level, attrs) => {
    const id = slugs[idx++];
    return `<h${level}${attrs} id="${id}">`;
  });

  return { slugs, htmlWithIds, tocItems };
}
