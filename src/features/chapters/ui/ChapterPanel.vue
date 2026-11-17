<script setup lang="ts">
import { Combine, History } from "lucide-vue-next";
import type {
  Chapter,
  ChapterAlias,
  StructureRecord,
} from "../../../shared/document";
import ChapterItem from "./ChapterItem.vue";
import StructureDialog from "./StructureDialog.vue";
import type { StructureDialog as DialogState } from "../model/structure";
import type { MergePreview, SplitPreview, ChapterConflict } from "../lib/structure";

defineProps<{
  chapters: Chapter[];
  active: string;
  editing: string;
  draft: string;
  error: string;
  structureStatus: string;
  dialog: DialogState;
  splitPreview: SplitPreview | null;
  mergePreview: MergePreview | null;
  currentPageIsSplitPoint: boolean;
  activePageId: string;
  splitChapterId: string;
  splitPageId: string;
  boundary: "before" | "after";
  structureDraftTitle: string;
  mergeIds: string[];
  history: StructureRecord[];
  aliases: ChapterAlias[];
  conflicts: ChapterConflict[];
  conflictRecord: StructureRecord | null;
}>();
const emit = defineEmits<{
  select: [id: string];
  rename: [id: string];
  move: [id: string, delta: number];
  remove: [id: string];
  split: [id: string];
  openMerge: [];
  openHistory: [];
  draft: [value: string];
  save: [];
  closeDialog: [];
  chooseSplitChapter: [id: string];
  chooseSplitPage: [id: string];
  setBoundary: [value: "before" | "after"];
  setStructureTitle: [value: string];
  toggleMerge: [id: string];
  confirmSplit: [];
  confirmMerge: [];
  requestUndo: [record: StructureRecord];
  dismissConflict: [];
}>();
</script>
<template>
  <section class="chapters">
    <div class="section-heading">
      <span>章节目录</span
      ><span class="heading-tools">
        <button title="合并相邻章节" class="heading-btn" @click="emit('openMerge')">
          <Combine :size="12" />
        </button>
        <button title="结构操作历史与撤回" class="heading-btn" @click="emit('openHistory')">
          <History :size="12" />
        </button>
        <span class="muted">{{ chapters.length }} 章</span>
      </span>
    </div>
    <ChapterItem
      v-for="(c, i) in chapters"
      :key="c.id"
      :chapter="c"
      :active="c.id === active"
      :number="i + 1"
      @select="emit('select', c.id)"
      @rename="emit('rename', c.id)"
      @move="emit('move', c.id, $event)"
      @remove="emit('remove', c.id)"
      @split="emit('split', c.id)"
    />
    <form v-if="editing" class="rename-form" @submit.prevent="emit('save')">
      <input
        aria-label="章节名称"
        :value="draft"
        @input="emit('draft', ($event.target as HTMLInputElement).value)"
      /><button>保存</button>
    </form>
    <p v-if="error" role="alert" class="notice">{{ error }}</p>
    <p v-if="structureStatus" role="status" class="notice structure-notice">
      {{ structureStatus }}
    </p>
    <div class="chapter-note">
      故事的每一格，都值得停留。<br />戴上耳机，进入雨夜。
    </div>

    <StructureDialog
      :dialog="dialog"
      :chapters="chapters"
      :split-preview="splitPreview"
      :merge-preview="mergePreview"
      :current-page-is-split-point="currentPageIsSplitPoint"
      :active-page-id="activePageId"
      :split-chapter-id="splitChapterId"
      :split-page-id="splitPageId"
      :boundary="boundary"
      :draft-title="structureDraftTitle"
      :merge-ids="mergeIds"
      :history="history"
      :aliases="aliases"
      :conflicts="conflicts"
      :conflict-record="conflictRecord"
      @close="emit('closeDialog')"
      @choose-split-chapter="emit('chooseSplitChapter', $event)"
      @choose-split-page="emit('chooseSplitPage', $event)"
      @set-boundary="emit('setBoundary', $event)"
      @set-title="emit('setStructureTitle', $event)"
      @toggle-merge="emit('toggleMerge', $event)"
      @confirm-split="emit('confirmSplit')"
      @confirm-merge="emit('confirmMerge')"
      @request-undo="emit('requestUndo', $event)"
      @dismiss-conflict="emit('dismissConflict')"
    />
  </section>
</template>
