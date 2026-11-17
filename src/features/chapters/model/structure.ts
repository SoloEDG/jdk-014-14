import { ref, computed, type Ref } from "vue";
import type {
  Bookmark,
  ChapterAlias,
  ComicDocument,
  ReadingLocation,
  StructureRecord,
} from "../../../shared/document";
import {
  buildMergePreview,
  buildSplitPreview,
  commitMerge,
  commitSplit,
  inspectUndo,
  remapLocation,
  undoStructure,
  type MergePreview,
  type SplitPreview,
  type ChapterConflict,
} from "../lib/structure";

export type StructureDialog =
  | { mode: "split" }
  | { mode: "merge" }
  | { mode: "history" }
  | null;

export function useStructure(
  doc: Ref<ComicDocument>,
  bookmarks: Ref<Bookmark[]>,
  location: Ref<ReadingLocation>,
  changed: () => void,
) {
  const dialog = ref<StructureDialog>(null),
    status = ref(""),
    error = ref(""),
    splitChapterId = ref(""),
    splitPageId = ref(""),
    boundary = ref<"before" | "after">("after"),
    draftTitle = ref(""),
    mergeIds = ref<string[]>([]),
    conflicts = ref<ChapterConflict[]>([]),
    conflictRecord = ref<StructureRecord | null>(null);

  const history = computed<StructureRecord[]>(() =>
    [...(doc.value.structureHistory ?? [])].reverse(),
  );
  const aliases = computed<ChapterAlias[]>(() => doc.value.chapterAliases ?? []);

  const splitPreview = computed<SplitPreview | null>(() => {
    if (dialog.value?.mode !== "split" || !splitChapterId.value) return null;
    return buildSplitPreview(doc.value, bookmarks.value, {
      chapterId: splitChapterId.value,
      pageId: splitPageId.value,
      boundary: boundary.value,
      title: draftTitle.value,
    });
  });

  const mergePreview = computed<MergePreview | null>(() =>
    dialog.value?.mode === "merge" && mergeIds.value.length
      ? buildMergePreview(doc.value, bookmarks.value, {
          chapterIds: mergeIds.value,
          title: draftTitle.value,
        })
      : null,
  );

  const currentPageIsSplitPoint = computed(
    () => splitPreview.value?.pageId === location.value.pageId,
  );

  function openSplit(chapterId: string) {
    const chapter = doc.value.chapters.find((c) => c.id === chapterId);
    if (!chapter) return;
    splitChapterId.value = chapter.id;
    const inThisChapter = chapter.pages.some(
      (p) => p.id === location.value.pageId,
    );
    splitPageId.value =
      inThisChapter && chapter.pages.length > 1
        ? location.value.pageId
        : chapter.pages[0]?.id ?? "";
    boundary.value = "after";
    draftTitle.value = "";
    error.value = "";
    status.value = "";
    dialog.value = { mode: "split" };
  }

  function openMerge() {
    mergeIds.value = [];
    draftTitle.value = "";
    error.value = "";
    status.value = "";
    dialog.value = { mode: "merge" };
  }

  function openHistory() {
    dialog.value = { mode: "history" };
  }

  function close() {
    dialog.value = null;
    conflicts.value = [];
    conflictRecord.value = null;
    error.value = "";
  }

  function toggleMerge(id: string) {
    if (mergeIds.value.includes(id))
      mergeIds.value = mergeIds.value.filter((x) => x !== id);
    else mergeIds.value = [...mergeIds.value, id];
  }

  function confirmSplit() {
    const preview = splitPreview.value;
    if (!preview || preview.error) {
      error.value = preview?.error ?? "无法拆分该章节";
      return;
    }
    const result = commitSplit(doc.value, bookmarks.value, {
      chapterId: splitChapterId.value,
      pageId: splitPageId.value,
      boundary: boundary.value,
      title: draftTitle.value,
    });
    if (result.error) {
      error.value = result.error;
      return;
    }
    remapLocation(doc.value, location.value);
    status.value = `已拆分：选定页《${preview.selectedPageTitle}》归入${
      preview.selectedGoesRight ? "新章节" : "原章节"
    }，阅读位置仍停留在同一格`;
    changed();
    close();
  }

  function confirmMerge() {
    const preview = mergePreview.value;
    if (!preview || preview.error) {
      error.value = preview?.error ?? "无法合并所选章节";
      return;
    }
    const result = commitMerge(doc.value, bookmarks.value, {
      chapterIds: mergeIds.value,
      title: draftTitle.value,
    });
    if (result.error) {
      error.value = result.error;
      return;
    }
    remapLocation(doc.value, location.value);
    status.value = `已合并 ${preview.selection.length} 章，${preview.pageCount} 页按原顺序接续，阅读位置仍停留在同一格`;
    changed();
    close();
  }

  function requestUndo(record: StructureRecord) {
    const inspection = inspectUndo(doc.value, record);
    if (inspection.conflicts.length) {
      conflictRecord.value = record;
      conflicts.value = inspection.conflicts;
      return;
    }
    const result = undoStructure(doc.value, bookmarks.value, record);
    if (result.error) {
      error.value = result.error;
      return;
    }
    remapLocation(doc.value, location.value);
    const kept = inspection.preservedEdits.length
      ? `；${[...new Set(inspection.preservedEdits)].join("，")}`
      : "";
    status.value = `已撤回该结构操作${kept}；操作之后新增的书签与阅读位置均已保留`;
    changed();
    close();
  }

  function dismissConflict() {
    conflicts.value = [];
    conflictRecord.value = null;
  }

  return {
    dialog,
    status,
    error,
    history,
    aliases,
    splitPreview,
    mergePreview,
    currentPageIsSplitPoint,
    splitChapterId,
    splitPageId,
    boundary,
    draftTitle,
    mergeIds,
    conflicts,
    conflictRecord,
    openSplit,
    openMerge,
    openHistory,
    close,
    toggleMerge,
    confirmSplit,
    confirmMerge,
    requestUndo,
    dismissConflict,
  };
}
