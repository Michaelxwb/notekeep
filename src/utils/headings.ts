export function getHeadings(content: string): { level: number; text: string; id: string }[] {
  const headings: { level: number; text: string; id: string }[] = [];
  for (const line of content.split('\n')) {
    const m = line.match(/^(#{1,6})\s+(.+)/);
    if (m) {
      const level = m[1].length;
      const text = m[2].trim();
      headings.push({ level, text, id: text.toLowerCase().replace(/\s+/g, '-').replace(/[^\w-]/g, '') });
    }
  }
  return headings;
}