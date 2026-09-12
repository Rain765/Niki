import type { PresentationSource } from '@open-design/contracts';

/** The evidence ledger is derived from source text, never from generated summaries. */
export function analyzePresentationSource(
  document: string,
): PresentationSource {
  const blocks: string[] = [];
  for (const paragraph of document.replace(/\r\n/g, '\n').split(/\n\s*\n/)) {
    if (!paragraph.trim()) continue;
    if (/^\s*\|/.test(paragraph)) {
      blocks.push(paragraph);
      continue;
    }
    // Keep table rows together and split only at source line boundaries.
    let pending = '';
    for (const line of paragraph.split('\n')) {
      if (pending.length + line.length > 1500 && pending) {
        blocks.push(pending);
        pending = '';
      }
      pending += (pending ? '\n' : '') + line;
    }
    if (pending) blocks.push(pending);
  }
  const facts: PresentationSource['facts'] = [];
  const tables: PresentationSource['tables'] = [];
  blocks.forEach((block, index) => {
    const tableLines = block
      .split('\n')
      .filter((l) => /^\s*\|.+\|\s*$/.test(l));
    const rows = tableLines
      .filter((l) => !/^\s*\|[\s:|\-]+\|\s*$/.test(l))
      .map((l) =>
        l
          .trim()
          .slice(1, -1)
          .split('|')
          .map((c) => c.trim()),
      );
    if (rows.length > 1)
      tables.push({
        id: `T${tables.length + 1}`,
        sourceRef: index + 1,
        headers: rows[0]!,
        rows: rows.slice(1),
      });
    for (const line of block.split('\n')) {
      if (!line.trim() || /^\s*\|[\s:|\-]+\|\s*$/.test(line)) continue;
      const sentences = line.match(/[^。！？\n]+[。！？]?/g) ?? [line];
      for (const sentence of sentences) {
        const quote = sentence.trim();
        if (quote.length < 3) continue;
        facts.push({
          id: `F${facts.length + 1}`,
          sourceRef: index + 1,
          quote,
          critical:
            /\d|必须|不得|不能|仅|例外|如果|否则|not |must|unless|only|except|\|/i.test(
              quote,
            ),
        });
      }
    }
  });
  const recommendedPages = Math.max(
    5,
    Math.ceil(document.length / 750) + 2,
    Math.ceil(
      tables.reduce(
        (n, t) => n + t.rows.length * Math.ceil(t.headers.length / 6),
        0,
      ) / 8,
    ) + 2,
  );
  const warnings =
    recommendedPages > 30
      ? ['材料容量预计超过 30 页，建议分章节生成；完整模式不会静默删除内容。']
      : [];
  return { blocks, facts, tables, recommendedPages, warnings };
}

export function visiblePresentationText(
  slide: import('@open-design/contracts').PresentationSlide,
): string {
  const heading = [slide.title, slide.subtitle];
  if (slide.table)
    return [
      ...heading,
      slide.table.headers.join(' '),
      ...slide.table.rows.map((r) => r.join(' ')),
    ].join('\n');
  if (slide.chart)
    return [
      ...heading,
      slide.chart.unit,
      ...slide.chart.labels.map(
        (label, i) => `${label}: ${slide.chart!.values[i]}`,
      ),
    ].join('\n');
  if (slide.image) return [...heading, slide.image.caption].join('\n');
  return [
    ...heading,
    ...slide.items.flatMap((i) => [i.title, i.body]),
    ...(['architecture', 'flow', 'cycle'].includes(slide.layout)
      ? slide.edges
      : []
    ).map(
      (e) =>
        `${slide.items.find((i) => i.id === e.from)?.title ?? e.from} → ${slide.items.find((i) => i.id === e.to)?.title ?? e.to}${e.label ? ': ' + e.label : ''}`,
    ),
    ...(['architecture', 'flow'].includes(slide.layout)
      ? (slide.groups ?? [])
      : []
    ).map(
      (g, index) =>
        `${g.title}: ${slide.items
          .filter((item) => item.group === g.id || (!item.group && index === 0))
          .map((item) => item.title)
          .join('、')}`,
    ),
  ].join('\n');
}

/** Review an identical sentence once, retaining every occurrence and its source scope. */
export function presentationReviewFacts(source: PresentationSource) {
  const groups = new Map<
    string,
    PresentationSource['facts'][number] & {
      factIds: string[];
      occurrences: { sourceRef: number; context: string }[];
    }
  >();
  for (const fact of source.facts) {
    let group = groups.get(fact.quote);
    if (!group) {
      group = { ...fact, factIds: [], occurrences: [] };
      groups.set(fact.quote, group);
    }
    group.factIds.push(fact.id);
    group.critical ||= fact.critical;
    const heading = source.blocks
      .slice(0, fact.sourceRef)
      .reverse()
      .find((block) => /^#{1,6}\s/.test(block));
    group.occurrences.push({
      sourceRef: fact.sourceRef,
      context: heading ?? source.blocks[fact.sourceRef - 1]!,
    });
  }
  return [...groups.values()];
}
