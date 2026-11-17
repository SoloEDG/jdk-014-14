import type {
  Bookmark,
  Chapter,
  ChapterSnapshot,
  ComicDocument,
  PanelSnapshot,
  StructureRecord,
} from "../../../shared/document";
import { makeId } from "../../../shared/commands";

export interface StructureResult {
  record?: StructureRecord;
  error?: string;
}

export interface PreviewPage {
  id: string;
  title: string;
}

export interface PreviewBookmarkItem {
  id: string;
  label: string;
  pageTitle: string;
  fromChapterId: string;
  fromChapterTitle: string;
  toChapterId: string;
  toChapterTitle: string;
  changed: boolean;
}

export interface SplitPreview {
  kind: "split";
  chapterId: string;
  chapterTitle: string;
  pageId: string;
  boundary: "before" | "after";
  error?: string;
  leftTitle: string;
  rightTitle: string;
  leftPages: PreviewPage[];
  rightPages: PreviewPage[];
  selectedPageTitle: string;
  /** 选定页是否归入新章（true=新章，false=留在原章） */
  selectedGoesRight: boolean;
  bookmarks: PreviewBookmarkItem[];
  affectedBookmarks: number;
}

export interface MergePreview {
  kind: "merge";
  error?: string;
  selection: { id: string; title: string; pages: PreviewPage[] }[];
  mergedTitle: string;
  pageCount: number;
  bookmarks: PreviewBookmarkItem[];
  affectedBookmarks: number;
}

export interface ChapterConflict {
  chapterId: string;
  title: string;
  changes: string[];
}

export interface UndoInspection {
  /** 阻断撤回的结构性冲突 */
  conflicts: ChapterConflict[];
  /** 不阻断撤回、将被原样保留的操作后内容改编 */
  preservedEdits: string[];
}

/** 图片只保留轻量签名用于比对，快照不复制图片数据本身 */
function imageSignature(image: string): string {
  let h = 0;
  const step = Math.max(1, Math.floor(image.length / 512));
  for (let i = 0; i < image.length; i += step)
    h = (h * 31 + image.charCodeAt(i)) | 0;
  return `${image.length}:${h}`;
}

export function takeChapterSnapshot(chapter: Chapter): ChapterSnapshot {
  return {
    id: chapter.id,
    title: chapter.title,
    subtitle: chapter.subtitle,
    pages: chapter.pages.map((p) => ({
      id: p.id,
      title: p.title,
      width: p.width,
      height: p.height,
      imageSignature: imageSignature(p.image),
      panels: p.panels.map<PanelSnapshot>((panel) => ({
        id: panel.id,
        speaker: panel.speaker,
        dialogue: panel.dialogue,
        sound: panel.sound,
        duration: panel.duration,
        rect: { ...panel.rect },
      })),
    })),
  };
}

export function chapterTitle(doc: ComicDocument, id: string): string {
  return doc.chapters.find((c) => c.id === id)?.title ?? "已消失的章节";
}

export function locatePage(
  doc: ComicDocument,
  pageId: string,
): { chapterId: string; chapterTitle: string; pageTitle: string } | undefined {
  for (const c of doc.chapters) {
    const p = c.pages.find((p) => p.id === pageId);
    if (p) return { chapterId: c.id, chapterTitle: c.title, pageTitle: p.title };
  }
  return undefined;
}

function pageOwnerMap(doc: ComicDocument): Map<string, string> {
  const map = new Map<string, string>();
  for (const c of doc.chapters) for (const p of c.pages) map.set(p.id, c.id);
  return map;
}

function buildBookmarkPreview(
  doc: ComicDocument,
  bookmarks: Bookmark[],
  nextOwner: Map<string, string>,
  syntheticTitles: Map<string, string> = new Map(),
): PreviewBookmarkItem[] {
  return bookmarks.map((b) => {
    const fromId = b.location.chapterId;
    const toId = nextOwner.get(b.location.pageId) ?? fromId;
    const located = locatePage(doc, b.location.pageId);
    return {
      id: b.id,
      label: b.label,
      pageTitle: located?.pageTitle ?? "未知页",
      fromChapterId: fromId,
      fromChapterTitle: chapterTitle(doc, fromId),
      toChapterId: toId,
      toChapterTitle:
        syntheticTitles.get(toId) ?? chapterTitle(doc, toId),
      changed: toId !== fromId,
    };
  });
}

export interface SplitRequest {
  chapterId: string;
  pageId: string;
  boundary: "before" | "after";
  title?: string;
}

export function buildSplitPreview(
  doc: ComicDocument,
  bookmarks: Bookmark[],
  req: SplitRequest,
): SplitPreview {
  const chapter = doc.chapters.find((c) => c.id === req.chapterId);
  const index = chapter?.pages.findIndex((p) => p.id === req.pageId) ?? -1;
  const cut = req.boundary === "before" ? index : index + 1;
  const base: SplitPreview = {
    kind: "split",
    chapterId: req.chapterId,
    chapterTitle: chapter?.title ?? "未知章节",
    pageId: req.pageId,
    boundary: req.boundary,
    leftTitle: chapter?.title ?? "",
    rightTitle: chapter
      ? req.title?.trim() || `${chapter.title}（续）`
      : "",
    leftPages: [],
    rightPages: [],
    selectedPageTitle: chapter?.pages[index]?.title ?? "",
    selectedGoesRight: req.boundary === "before",
    bookmarks: [],
    affectedBookmarks: 0,
  };
  if (!chapter || index < 0) {
    base.error = "选定的章节或页面不存在";
    return base;
  }
  if (cut <= 0 || cut >= chapter.pages.length) {
    base.error = "拆分点会产生空章节，请改选页面或切换归属";
    return base;
  }
  const leftPages = chapter.pages.slice(0, cut);
  const rightPages = chapter.pages.slice(cut);
  base.leftPages = leftPages.map((p) => ({ id: p.id, title: p.title }));
  base.rightPages = rightPages.map((p) => ({ id: p.id, title: p.title }));
  const rightId = "（新章节）";
  const nextOwner = pageOwnerMap(doc);
  for (const p of rightPages) nextOwner.set(p.id, rightId);
  const rightTitle = req.title?.trim() || `${chapter.title}（续）`;
  base.bookmarks = buildBookmarkPreview(
    doc,
    bookmarks,
    nextOwner,
    new Map([[rightId, rightTitle]]),
  );
  base.affectedBookmarks = base.bookmarks.filter((b) => b.changed).length;
  return base;
}

export interface MergeRequest {
  chapterIds: string[];
  title?: string;
}

export function buildMergePreview(
  doc: ComicDocument,
  bookmarks: Bookmark[],
  req: MergeRequest,
): MergePreview {
  const positions = req.chapterIds.map((id) =>
    doc.chapters.findIndex((c) => c.id === id),
  );
  const valid = positions.filter((i) => i >= 0).sort((a, b) => a - b);
  const ordered = valid.map((i) => doc.chapters[i]!);
  const preview: MergePreview = {
    kind: "merge",
    selection: ordered.map((c) => ({
      id: c.id,
      title: c.title,
      pages: c.pages.map((p) => ({ id: p.id, title: p.title })),
    })),
    mergedTitle: req.title?.trim() || `${ordered[0]?.title ?? ""}（合订）`,
    pageCount: ordered.reduce((n, c) => n + c.pages.length, 0),
    bookmarks: [],
    affectedBookmarks: 0,
  };
  if (req.chapterIds.length < 2) {
    preview.error = "请至少选择两个章节";
    return preview;
  }
  if (valid.length !== req.chapterIds.length) {
    preview.error = "部分章节已不存在，请重新选择";
    return preview;
  }
  for (let k = 1; k < valid.length; k++) {
    if (valid[k] !== valid[k - 1]! + 1) {
      preview.error = "只能合并目录中相邻的章节";
      return preview;
    }
  }
  const mergedId = "（合并章节）";
  const nextOwner = pageOwnerMap(doc);
  for (const c of ordered) for (const p of c.pages) nextOwner.set(p.id, mergedId);
  preview.bookmarks = buildBookmarkPreview(
    doc,
    bookmarks,
    nextOwner,
    new Map([[mergedId, preview.mergedTitle]]),
  );
  preview.affectedBookmarks = preview.bookmarks.filter((b) => b.changed).length;
  return preview;
}

export function commitSplit(
  doc: ComicDocument,
  bookmarks: Bookmark[],
  req: SplitRequest,
  at = Date.now(),
): StructureResult {
  const chapter = doc.chapters.find((c) => c.id === req.chapterId);
  const index = chapter?.pages.findIndex((p) => p.id === req.pageId) ?? -1;
  if (!chapter || index < 0) return { error: "选定的章节或页面不存在" };
  const cut = req.boundary === "before" ? index : index + 1;
  if (cut <= 0 || cut >= chapter.pages.length)
    return { error: "拆分点会产生空章节，请改选页面或归属" };

  const before = [takeChapterSnapshot(chapter)];
  const originalTitle = chapter.title;
  const leftPages = chapter.pages.slice(0, cut);
  const rightPages = chapter.pages.slice(cut);
  const rightId = makeId("chapter");
  const rightTitle = req.title?.trim() || `${originalTitle}（续）`;
  const right: Chapter = {
    id: rightId,
    title: rightTitle,
    subtitle: `由「${originalTitle}」拆分 · ${rightPages.length} 页`,
    // 页面对象整体迁移，分镜对白与图片数据均不复制、不丢失
    pages: rightPages,
  };
  chapter.pages = leftPages;
  const pos = doc.chapters.indexOf(chapter);
  doc.chapters.splice(pos + 1, 0, right);

  const rightPageIds = new Set(rightPages.map((p) => p.id));
  for (const b of bookmarks)
    if (rightPageIds.has(b.location.pageId)) b.location.chapterId = rightId;

  const record: StructureRecord = {
    id: makeId("struct"),
    kind: "split",
    at,
    label: `拆分「${originalTitle}」为「${chapter.title}」与「${rightTitle}」`,
    chapterIds: [chapter.id, rightId],
    before,
    after: [takeChapterSnapshot(chapter), takeChapterSnapshot(right)],
    split: {
      sourceChapterId: chapter.id,
      tailChapterId: rightId,
      selectedPageId: req.pageId,
      boundary: req.boundary,
    },
  };
  (doc.structureHistory ??= []).push(record);
  return { record };
}

export function commitMerge(
  doc: ComicDocument,
  bookmarks: Bookmark[],
  req: MergeRequest,
  at = Date.now(),
): StructureResult {
  const positions = req.chapterIds.map((id) =>
    doc.chapters.findIndex((c) => c.id === id),
  );
  if (req.chapterIds.length < 2) return { error: "请至少选择两个章节" };
  if (positions.some((i) => i < 0))
    return { error: "部分章节已不存在，请重新选择" };
  const sorted = positions.slice().sort((a, b) => a - b);
  for (let k = 1; k < sorted.length; k++) {
    if (sorted[k] !== sorted[k - 1]! + 1)
      return { error: "只能合并目录中相邻的章节" };
  }
  const ordered = sorted.map((i) => doc.chapters[i]!);
  const before = ordered.map(takeChapterSnapshot);
  const first = ordered[0]!;
  const mergedId = makeId("chapter");
  const mergedTitle = req.title?.trim() || `${first.title}（合订）`;
  const pages = ordered.flatMap((c) => c.pages);
  const merged: Chapter = {
    id: mergedId,
    title: mergedTitle,
    subtitle: `由 ${ordered.length} 章合并 · ${pages.length} 页`,
    pages,
  };
  const start = sorted[0]!;
  doc.chapters.splice(start, ordered.length, merged);

  const sourceIds = ordered.map((c) => c.id);
  for (const b of bookmarks)
    if (sourceIds.includes(b.location.chapterId))
      b.location.chapterId = mergedId;

  const recordId = makeId("struct");
  (doc.chapterAliases ??= []).push(
    ...sourceIds.map((oldId) => ({
      oldId,
      newId: mergedId,
      kind: "merge" as const,
      recordId,
      at,
    })),
  );
  const record: StructureRecord = {
    id: recordId,
    kind: "merge",
    at,
    label: `合并 ${ordered.length} 章为「${mergedTitle}」`,
    chapterIds: [mergedId],
    before,
    after: [takeChapterSnapshot(merged)],
    merge: { sourceIds, mergedChapterId: mergedId },
  };
  (doc.structureHistory ??= []).push(record);
  return { record };
}

/** 结构性差异：章节缺失、页集合或页序变化——这些会让结构还原产生歧义 */
function structuralDiffs(
  baseline: ChapterSnapshot,
  current: Chapter | undefined,
): string[] {
  const changes: string[] = [];
  if (!current) {
    changes.push(`章节「${baseline.title}」已被删除或再次合并，无法整体还原`);
    return changes;
  }
  const baseIds = baseline.pages.map((p) => p.id);
  const curIds = current.pages.map((p) => p.id);
  const curSet = new Set(curIds);
  const baseSet = new Set(baseIds);
  for (const p of baseline.pages)
    if (!curSet.has(p.id)) changes.push(`页《${p.title}》已被移除`);
  for (const p of current.pages)
    if (!baseSet.has(p.id)) changes.push(`新增了页《${p.title}》`);
  if (
    !changes.length &&
    baseIds.length === curIds.length &&
    baseIds.some((id, i) => id !== curIds[i])
  )
    changes.push("页面顺序已被调整");
  return changes;
}

/** 内容级改编（对白、说话人、声景、框格、图片等）：不阻断撤回，将原样保留 */
function contentEdits(
  baseline: ChapterSnapshot,
  current: Chapter | undefined,
): string[] {
  if (!current) return [];
  const edits: string[] = [];
  let dialogueCount = 0,
    panelCount = 0,
    imageCount = 0,
    pageTitleCount = 0;
  for (const bp of baseline.pages) {
    const cp = current.pages.find((p) => p.id === bp.id);
    if (!cp) continue;
    if (bp.imageSignature && imageSignature(cp.image) !== bp.imageSignature)
      imageCount++;
    if (cp.title !== bp.title) pageTitleCount++;
    const livePanels = new Map(cp.panels.map((x) => [x.id, x]));
    for (const spp of bp.panels) {
      const live = livePanels.get(spp.id);
      if (!live) continue;
      if (live.dialogue !== spp.dialogue) dialogueCount++;
      if (
        live.speaker !== spp.speaker ||
        live.sound !== spp.sound ||
        live.duration !== spp.duration ||
        JSON.stringify(live.rect) !== JSON.stringify(spp.rect)
      )
        panelCount++;
    }
  }
  if (dialogueCount) edits.push(`${dialogueCount} 处对白修改将保留`);
  if (panelCount) edits.push(`${panelCount} 处分镜（说话人/声景/时长/框格）修改将保留`);
  if (imageCount) edits.push(`${imageCount} 张图片更换将保留`);
  if (pageTitleCount) edits.push(`${pageTitleCount} 个页标题修改将保留`);
  return edits;
}

/**
 * 撤回前检查：
 * - 结构性改编（章节消失、页增减/调序、合并章改名）→ 冲突，阻断撤回
 * - 内容级改编（对白/分镜/图片）→ 不阻断，撤回结构时原样保留
 */
export function inspectUndo(
  doc: ComicDocument,
  record: StructureRecord,
): UndoInspection {
  if (record.undone)
    return {
      conflicts: [
        {
          chapterId: "",
          title: record.label,
          changes: ["该结构操作已经撤回过，不能重复撤回"],
        },
      ],
      preservedEdits: [],
    };
  const conflicts: ChapterConflict[] = [];
  const preservedEdits: string[] = [];
  for (const baseline of record.after) {
    const current = doc.chapters.find((c) => c.id === baseline.id);
    const changes = structuralDiffs(baseline, current);
    if (changes.length)
      conflicts.push({
        chapterId: baseline.id,
        title: current?.title ?? baseline.title,
        changes,
      });
    preservedEdits.push(...contentEdits(baseline, current));
  }
  if (record.kind === "merge") {
    const merged = doc.chapters.find(
      (c) => c.id === record.merge!.mergedChapterId,
    );
    const baseline = record.after[0]!;
    if (
      merged &&
      (merged.title !== baseline.title || merged.subtitle !== baseline.subtitle)
    )
      conflicts.push({
        chapterId: merged.id,
        title: merged.title,
        changes: [
          `合并章节已重命名（快照为「${baseline.title}」），撤回无法把新名称拆回多个源章节`,
        ],
      });
  }
  return { conflicts, preservedEdits };
}

type LivePage = Chapter["pages"][number];

function livePageIndex(doc: ComicDocument): Map<string, LivePage> {
  return new Map(
    doc.chapters.flatMap((c) => c.pages).map((p) => [p.id, p]),
  );
}

/**
 * 执行撤回：仅还原章节结构（身份、页序、归属）。
 * 页面与分镜对象始终取活文档，操作之后的对白、图片等修改原样保留；
 * 调用前应先通过 inspectUndo 确认无结构性冲突。
 */
export function undoStructure(
  doc: ComicDocument,
  bookmarks: Bookmark[],
  record: StructureRecord,
  at = Date.now(),
): StructureResult {
  if (record.undone) return { error: "该操作已经撤回过" };
  try {
    if (record.kind === "split") {
      const info = record.split!;
      const left = doc.chapters.find((c) => c.id === info.sourceChapterId);
      const tail = doc.chapters.find((c) => c.id === info.tailChapterId);
      if (!left || !tail) return { error: "原章节已不存在，无法撤回" };
      const pages = livePageIndex(doc);
      const snap = record.before[0]!;
      // 按快照页序取回活页对象：内容不回滚，只还原归属与顺序
      left.pages = snap.pages.map((sp) => {
        const page = pages.get(sp.id);
        if (!page) throw new Error("snapshot-page-missing");
        return page;
      });
      doc.chapters.splice(doc.chapters.indexOf(tail), 1);
      for (const b of bookmarks)
        if (b.location.chapterId === tail.id)
          b.location.chapterId = left.id;
    } else {
      const info = record.merge!;
      const index = doc.chapters.findIndex(
        (c) => c.id === info.mergedChapterId,
      );
      if (index < 0) return { error: "合并后的章节已不存在，无法撤回" };
      const pages = livePageIndex(doc);
      const restored: Chapter[] = record.before.map((snap) => ({
        // 复活旧章节身份，外部历史引用重新有效
        id: snap.id,
        title: snap.title,
        subtitle: snap.subtitle,
        pages: snap.pages.map((sp) => {
          const page = pages.get(sp.id);
          if (!page) throw new Error("snapshot-page-missing");
          return page;
        }),
      }));
      doc.chapters.splice(index, 1, ...restored);
      const owner = new Map<string, string>();
      for (const c of restored) for (const p of c.pages) owner.set(p.id, c.id);
      for (const b of bookmarks) {
        if (b.location.chapterId === info.mergedChapterId) {
          const target = owner.get(b.location.pageId);
          if (target) b.location.chapterId = target;
        }
      }
      doc.chapterAliases = (doc.chapterAliases ?? []).filter(
        (a) => a.recordId !== record.id,
      );
    }
    record.undone = true;
    record.undoneAt = at;
    return { record };
  } catch (error) {
    return {
      error:
        error instanceof Error ? `撤回失败：${error.message}` : "撤回失败",
    };
  }
}

/** 撤回后把阅读位置重新指回同一页/同一格所在的章节（页与格 id 不变） */
export function remapLocation(
  doc: ComicDocument,
  location: { chapterId: string; pageId: string; panelId: string },
): boolean {
  const found = locatePage(doc, location.pageId);
  if (!found) return false;
  location.chapterId = found.chapterId;
  return true;
}
