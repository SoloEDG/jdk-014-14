export { useChapters } from "./model/chapters";
export { default as ChapterPanel } from "./ui/ChapterPanel.vue";
export { default as StructureDialog } from "./ui/StructureDialog.vue";
export {
  buildSplitPreview,
  buildMergePreview,
  commitSplit,
  commitMerge,
  inspectUndo,
  undoStructure,
  takeChapterSnapshot,
  remapLocation,
} from "./lib/structure";
