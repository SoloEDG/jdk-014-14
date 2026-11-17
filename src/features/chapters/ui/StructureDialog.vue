<script setup lang="ts">
import { computed } from "vue";
import {
  X,
  Scissors,
  Combine,
  History,
  AlertTriangle,
  Check,
  Undo2,
  Bookmark,
  ArrowRight,
  MapPin,
} from "lucide-vue-next";
import type { StructureDialog as DialogState } from "../model/structure";
import type { Chapter, ChapterAlias, StructureRecord } from "../../../shared/document";
import type { MergePreview, SplitPreview, ChapterConflict } from "../lib/structure";

const props = defineProps<{
  dialog: DialogState;
  chapters: Chapter[];
  splitPreview: SplitPreview | null;
  mergePreview: MergePreview | null;
  currentPageIsSplitPoint: boolean;
  activePageId: string;
  splitChapterId: string;
  splitPageId: string;
  boundary: "before" | "after";
  draftTitle: string;
  mergeIds: string[];
  history: StructureRecord[];
  aliases: ChapterAlias[];
  conflicts: ChapterConflict[];
  conflictRecord: StructureRecord | null;
}>();

const emit = defineEmits<{
  close: [];
  chooseSplitChapter: [id: string];
  chooseSplitPage: [id: string];
  setBoundary: [value: "before" | "after"];
  setTitle: [value: string];
  toggleMerge: [id: string];
  confirmSplit: [];
  confirmMerge: [];
  requestUndo: [record: StructureRecord];
  dismissConflict: [];
}>();

const splitChapter = computed(() =>
  props.chapters.find((c) => c.id === props.splitChapterId),
);

function formatTime(at: number): string {
  const d = new Date(at);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function aliasOf(record: StructureRecord): ChapterAlias[] {
  return props.aliases.filter((a) => a.recordId === record.id);
}

function aliasFor(oldId: string): ChapterAlias | undefined {
  return props.aliases.find((a) => a.oldId === oldId);
}
</script>

<template>
  <div
    v-if="dialog"
    class="structure-overlay"
    role="dialog"
    aria-modal="true"
    @click.self="emit('close')"
  >
    <div class="structure-modal">
      <header class="structure-head">
        <div>
          <h2 v-if="dialog.mode === 'split'"><Scissors :size="16" /> 拆分章节</h2>
          <h2 v-else-if="dialog.mode === 'merge'">
            <Combine :size="16" /> 合并章节
          </h2>
          <h2 v-else><History :size="16" /> 结构操作历史</h2>
          <p v-if="dialog.mode !== 'history'">
            页、分镜、对白与图片整体迁移，不会复制或丢失
          </p>
          <p v-else>保留旧章节身份的可追溯映射，冲突时不会覆盖新内容</p>
        </div>
        <button class="icon-btn" aria-label="关闭" @click="emit('close')">
          <X :size="16" />
        </button>
      </header>

      <!-- 拆分 -->
      <div v-if="dialog.mode === 'split'" class="structure-body">
        <label class="field">
          <span>要拆分的章节</span>
          <select
            :value="splitChapterId"
            @change="emit('chooseSplitChapter', ($event.target as HTMLSelectElement).value)"
          >
            <option v-for="c in chapters" :key="c.id" :value="c.id">
              {{ c.title }}（{{ c.pages.length }} 页）
            </option>
          </select>
        </label>

        <div v-if="splitChapter" class="page-picker">
          <div class="field-caption">
            选择拆分页：页序预览将实时更新
          </div>
          <div class="page-chip-row">
            <button
              v-for="p in splitChapter.pages"
              :key="p.id"
              class="page-chip"
              :class="{
                picked: p.id === splitPageId,
                reading: p.id === activePageId,
              }"
              @click="emit('chooseSplitPage', p.id)"
            >
              <MapPin v-if="p.id === activePageId" :size="10" />
              {{ p.title }}
            </button>
          </div>
        </div>

        <div class="boundary-box">
          <label class="boundary-option">
            <input
              type="radio"
              name="boundary"
              :checked="boundary === 'after'"
              @change="emit('setBoundary', 'after')"
            />
            <span
              >选定页留在<b>原章节</b>，其后页面进入新章</span
            >
          </label>
          <label class="boundary-option">
            <input
              type="radio"
              name="boundary"
              :checked="boundary === 'before'"
              @change="emit('setBoundary', 'before')"
            />
            <span>选定页归入<b>新章节</b>，其前页面留在原章</span>
          </label>
        </div>
        <p v-if="currentPageIsSplitPoint && splitPreview" class="boundary-note">
          <MapPin :size="12" /> 当前正在阅读的就是选定页：归属为
          <b>{{ splitPreview.selectedGoesRight ? "新章节" : "原章节" }}</b
          >，确认后阅读位置、声景与进度仍停留在这一格。
        </p>

        <div v-if="splitPreview" class="preview-grid">
          <div class="preview-col">
            <h3>{{ splitPreview.leftTitle }}</h3>
            <ul>
              <li
                v-for="p in splitPreview.leftPages"
                :key="p.id"
                :class="{ reading: p.id === activePageId }"
              >
                {{ p.title }}
                <i v-if="p.id === activePageId">当前页</i>
              </li>
            </ul>
          </div>
          <Scissors class="preview-sep" :size="18" />
          <div class="preview-col new">
            <h3>{{ splitPreview.rightTitle }}</h3>
            <ul>
              <li
                v-for="p in splitPreview.rightPages"
                :key="p.id"
                :class="{ reading: p.id === activePageId }"
              >
                {{ p.title }}
                <i v-if="p.id === activePageId">当前页</i>
              </li>
            </ul>
          </div>
        </div>
        <p v-if="splitPreview?.error" class="modal-error" role="alert">
          <AlertTriangle :size="13" /> {{ splitPreview.error }}
        </p>

        <label class="field">
          <span>新章节名称（可选）</span>
          <input
            :value="draftTitle"
            placeholder="留空则自动在原章名后加（续）"
            @input="emit('setTitle', ($event.target as HTMLInputElement).value)"
          />
        </label>

        <div class="bookmark-preview">
          <div class="bp-head">
            <Bookmark :size="13" /> 受影响的书签
            <b>{{ splitPreview?.affectedBookmarks ?? 0 }}</b> 个将随页迁移
          </div>
          <p v-if="!splitPreview?.affectedBookmarks" class="bp-empty">
            没有书签落在迁移页面上
          </p>
          <ul v-else>
            <li
              v-for="b in splitPreview?.bookmarks.filter((x) => x.changed)"
              :key="b.id"
            >
              <span>{{ b.label }} · {{ b.pageTitle }}</span>
              <small
                >{{ b.fromChapterTitle }}<ArrowRight :size="10" />{{
                  b.toChapterTitle
                }}</small
              >
            </li>
          </ul>
        </div>

        <footer class="structure-actions">
          <button class="ghost-btn" @click="emit('close')">取消</button>
          <button
            class="primary-btn"
            :disabled="!!splitPreview?.error"
            @click="emit('confirmSplit')"
          >
            <Check :size="14" /> 确认拆分
          </button>
        </footer>
      </div>

      <!-- 合并 -->
      <div v-else-if="dialog.mode === 'merge'" class="structure-body">
        <p class="field-caption">
          勾选目录中相邻的章节，页面将按当前页序首尾相接
        </p>
        <div class="merge-list">
          <button
            v-for="c in chapters"
            :key="c.id"
            class="merge-row"
            :class="{ picked: mergeIds.includes(c.id) }"
            @click="emit('toggleMerge', c.id)"
          >
            <span class="check-box">
              <Check v-if="mergeIds.includes(c.id)" :size="12" />
            </span>
            <strong>{{ c.title }}</strong>
            <small>{{ c.pages.length }} 页</small>
          </button>
        </div>
        <p v-if="mergePreview?.error" class="modal-error" role="alert">
          <AlertTriangle :size="13" /> {{ mergePreview.error }}
        </p>

        <div v-if="mergePreview && !mergePreview.error" class="merge-order">
          <h3>合并后页序（{{ mergePreview.pageCount }} 页）</h3>
          <ol>
            <template v-for="part in mergePreview.selection" :key="part.id">
              <li class="merge-part-title">{{ part.title }}</li>
              <li v-for="p in part.pages" :key="p.id" class="merge-page">
                {{ p.title }}
                <i v-if="p.id === activePageId">当前页</i>
              </li>
            </template>
          </ol>
        </div>

        <label class="field">
          <span>合并后章节名称（可选）</span>
          <input
            :value="draftTitle"
            placeholder="留空则自动在首个章名后加（合订）"
            @input="emit('setTitle', ($event.target as HTMLInputElement).value)"
          />
        </label>

        <div class="bookmark-preview">
          <div class="bp-head">
            <Bookmark :size="13" /> 受影响的书签
            <b>{{ mergePreview?.affectedBookmarks ?? 0 }}</b>
            个将改挂到合并章节
          </div>
          <p v-if="!mergePreview?.affectedBookmarks" class="bp-empty">
            所选章节上没有书签
          </p>
          <ul v-else>
            <li
              v-for="b in mergePreview?.bookmarks.filter((x) => x.changed)"
              :key="b.id"
            >
              <span>{{ b.label }} · {{ b.pageTitle }}</span>
              <small
                >{{ b.fromChapterTitle }}<ArrowRight :size="10" />{{
                  b.toChapterTitle
                }}</small
              >
            </li>
          </ul>
        </div>

        <footer class="structure-actions">
          <button class="ghost-btn" @click="emit('close')">取消</button>
          <button
            class="primary-btn"
            :disabled="!!mergePreview?.error || mergeIds.length < 2"
            @click="emit('confirmMerge')"
          >
            <Check :size="14" /> 确认合并
          </button>
        </footer>
      </div>

      <!-- 历史 / 撤回 -->
      <div v-else class="structure-body">
        <p v-if="!history.length" class="bp-empty">暂无结构操作记录</p>
        <div v-for="record in history" :key="record.id" class="history-card">
          <div class="history-main">
            <strong>{{ record.label }}</strong>
            <small>{{ formatTime(record.at) }}</small>
            <span v-if="record.undone" class="history-tag undone">
              已于 {{ record.undoneAt ? formatTime(record.undoneAt) : "" }} 撤回
            </span>
            <span v-else class="history-tag active">可撤回</span>
          </div>
          <div
            v-for="a in aliasOf(record)"
            :key="a.oldId"
            class="alias-line"
          >
            旧身份 {{ a.oldId }}<ArrowRight :size="10" />新身份 {{ a.newId }}
          </div>
          <p
            v-if="
              record.kind === 'split' &&
              !record.undone &&
              !aliasFor(record.split!.sourceChapterId)
            "
            class="alias-line"
          >
            原章身份 {{ record.split!.sourceChapterId }} 保留，新章身份
            {{ record.split!.tailChapterId }}
          </p>
          <button
            v-if="!record.undone"
            class="ghost-btn undo-btn"
            @click="emit('requestUndo', record)"
          >
            <Undo2 :size="13" /> 撤回此操作
          </button>
        </div>

        <!-- 冲突提示 -->
        <div v-if="conflicts.length" class="conflict-box" role="alert">
          <h3><AlertTriangle :size="15" /> 检测到操作后的结构改编，已阻止撤回</h3>
          <p>
            以下变化会让章节还原产生歧义。为避免吞掉新内容，本次未执行任何修改；
            对白、分镜与图片等内容改编不会阻断撤回，会在撤回时原样保留。
          </p>
          <div v-for="c in conflicts" :key="c.chapterId || c.title" class="conflict-item">
            <b>章节「{{ c.title }}」</b>
            <ul>
              <li v-for="(line, i) in c.changes" :key="i">{{ line }}</li>
            </ul>
          </div>
          <div class="structure-actions">
            <button class="ghost-btn" @click="emit('dismissConflict')">
              我知道了
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
