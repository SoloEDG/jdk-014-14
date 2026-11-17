export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}
export interface Panel {
  id: string;
  rect: Rect;
  dialogue: string;
  speaker: string;
  sound: "rain" | "pulse" | "wind";
  duration: number;
}
export interface ComicPage {
  id: string;
  title: string;
  image: string;
  width: number;
  height: number;
  panels: Panel[];
}
export interface Chapter {
  id: string;
  title: string;
  subtitle: string;
  pages: ComicPage[];
}
export type StructureKind = "split" | "merge";
/** 分镜快照：仅文本与框格，图片始终通过 page id 挂回活文档，不复制图片数据 */
export interface PanelSnapshot {
  id: string;
  speaker: string;
  dialogue: string;
  sound: Panel["sound"];
  duration: number;
  rect: Rect;
}
export interface PageSnapshot {
  id: string;
  title: string;
  width: number;
  height: number;
  /** 图片轻量签名（不含图片数据），撤回时用于识别图片是否被更换 */
  imageSignature?: string;
  panels: PanelSnapshot[];
}
export interface ChapterSnapshot {
  id: string;
  title: string;
  subtitle: string;
  pages: PageSnapshot[];
}
export interface SplitRecordInfo {
  sourceChapterId: string;
  tailChapterId: string;
  selectedPageId: string;
  /** before：选定页归入新章；after：选定页留在原章 */
  boundary: "before" | "after";
}
export interface MergeRecordInfo {
  sourceIds: string[];
  mergedChapterId: string;
}
/** 一次结构操作的可追溯记录，随文档持久化 */
export interface StructureRecord {
  id: string;
  kind: StructureKind;
  at: number;
  label: string;
  chapterIds: string[];
  /** 操作前章节快照（拆分 1 个，合并为全部源章节） */
  before: ChapterSnapshot[];
  /** 操作刚完成时的章节指纹基线，撤回时据此检测冲突 */
  after: ChapterSnapshot[];
  split?: SplitRecordInfo;
  merge?: MergeRecordInfo;
  undone?: boolean;
  undoneAt?: number;
}
/** 旧章节身份到新身份的映射，保证外部历史引用可追溯 */
export interface ChapterAlias {
  oldId: string;
  newId: string;
  kind: StructureKind;
  recordId: string;
  at: number;
}
export interface ComicDocument {
  version: 1;
  id: string;
  title: string;
  author: string;
  chapters: Chapter[];
  chapterAliases?: ChapterAlias[];
  structureHistory?: StructureRecord[];
}
export interface ReadingLocation {
  chapterId: string;
  pageId: string;
  panelId: string;
  zoom: number;
  x: number;
  y: number;
}
export interface Bookmark {
  id: string;
  label: string;
  location: ReadingLocation;
  created: number;
}
export type ReadingMode = "page" | "panel";
