/**
 * TaskResultPreview — AI 结果预览与编辑组件
 *
 * 功能：
 *   1. 三语文案展示与编辑（标题、卖点、描述）
 *   2. 背景图预览与选择（复选框勾选）
 *   3. 确认入库 / 放弃操作
 *
 * 复用 MultiLanguageInput 组件处理 i18n 标题和描述的编辑。
 * 卖点（bullets）因为是数组结构，需要自定义编辑 UI。
 */

import React, { useState, useCallback, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  CheckCircle2,
  XCircle,
  ImageIcon,
  FileText,
  ZoomIn,
  X,
} from 'lucide-react';
import type { AIListingResult } from '@/types/aiListing';

interface TaskResultPreviewProps {
  result: AIListingResult;
  onSave: (editedResult: AIListingResult, selectedImages: string[]) => void;
  onDiscard: () => void;
  saving?: boolean;
}

// 语言配置
const LANGUAGES = [
  { code: 'ru', label: 'Русский (俄语)' },
  { code: 'zh', label: '中文' },
  { code: 'tg', label: 'Тоҷикӣ (塔吉克语)' },
] as const;

type LangCode = 'ru' | 'zh' | 'tg';

const getLocalizedAIText = (
  value: string | { ru?: string; zh?: string; tg?: string } | undefined,
  lang: LangCode
): string => {
  if (!value) return '';
  if (typeof value === 'string') return value;
  return value[lang] || value.ru || value.zh || value.tg || '';
};

export const TaskResultPreview: React.FC<TaskResultPreviewProps> = ({
  result,
  onSave,
  onDiscard,
  saving = false,
}) => {
  // ─── 可编辑的文案状态 ──────────────────────────────────────────
  const [titles, setTitles] = useState<Record<LangCode, string>>({
    ru: result.title_ru,
    zh: result.title_zh,
    tg: result.title_tg,
  });

  const [bullets, setBullets] = useState<Record<LangCode, string[]>>({
    ru: [...result.bullets_ru],
    zh: [...result.bullets_zh],
    tg: [...result.bullets_tg],
  });

  const [descriptions, setDescriptions] = useState<Record<LangCode, string>>({
    ru: result.description_ru,
    zh: result.description_zh,
    tg: result.description_tg,
  });

  // ─── 图片选择状态 ──────────────────────────────────────────────
  const [selectedImages, setSelectedImages] = useState<Set<number>>(
    new Set(result.background_images.map((_, i) => i))
  );

  // ─── 图片放大预览 ──────────────────────────────────────────────
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  // ─── Tab 状态 ──────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<string>('ru');

  // 当 result 变化时重置状态
  useEffect(() => {
    setTitles({ ru: result.title_ru, zh: result.title_zh, tg: result.title_tg });
    setBullets({ ru: [...result.bullets_ru], zh: [...result.bullets_zh], tg: [...result.bullets_tg] });
    setDescriptions({ ru: result.description_ru, zh: result.description_zh, tg: result.description_tg });
    setSelectedImages(new Set(result.background_images.map((_, i) => i)));
  }, [result]);

  // ─── 编辑处理函数 ──────────────────────────────────────────────
  const handleTitleChange = useCallback((lang: LangCode, value: string) => {
    setTitles(prev => ({ ...prev, [lang]: value }));
  }, []);

  const handleBulletChange = useCallback((lang: LangCode, index: number, value: string) => {
    setBullets(prev => {
      const arr = [...prev[lang]];
      arr[index] = value;
      return { ...prev, [lang]: arr };
    });
  }, []);

  const handleDescriptionChange = useCallback((lang: LangCode, value: string) => {
    setDescriptions(prev => ({ ...prev, [lang]: value }));
  }, []);

  const toggleImageSelection = useCallback((index: number) => {
    setSelectedImages(prev => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  }, []);

  // ─── 提交 ───────────────────────────────────────────────
  const handleSave = useCallback(() => {
    const selectedBg = result.background_images.filter((_, i) => selectedImages.has(i));
    // v2.0：俄文营销海报一律默认入库（仅合成成功的）
    const marketingUrls = (result.marketing_images || [])
      .filter((m) => m.status === 'completed' && m.url)
      .map((m) => m.url);
    const selectedAll = [...selectedBg, ...marketingUrls];

    if (
      selectedAll.length === 0 &&
      (result.background_images.length > 0 || (result.marketing_images?.length ?? 0) > 0)
    ) {
      if (!window.confirm('您没有选择任何图片，确定只保存文案吗？')) return;
    }

    const editedResult: AIListingResult = {
      title_ru: titles.ru,
      title_zh: titles.zh,
      title_tg: titles.tg,
      bullets_ru: bullets.ru,
      bullets_zh: bullets.zh,
      bullets_tg: bullets.tg,
      description_ru: descriptions.ru,
      description_zh: descriptions.zh,
      description_tg: descriptions.tg,
      background_images: selectedBg,
      marketing_images: result.marketing_images,
      parent_task_id: result.parent_task_id,
      enqueued_images: result.enqueued_images,
      segmented_image: result.segmented_image,
      original_images: result.original_images,
      analysis: result.analysis,
    };

    onSave(editedResult, selectedAll);
  }, [titles, bullets, descriptions, selectedImages, result, onSave]);

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <FileText className="w-5 h-5 text-purple-600" />
            AI 生成结果预览
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* ─── 三语文案编辑 ─────────────────────────────────── */}
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid w-full grid-cols-3 bg-zinc-100 p-1">
              {LANGUAGES.map((lang) => (
                <TabsTrigger
                  key={lang.code}
                  value={lang.code}
                  className="data-[state=active]:bg-white data-[state=active]:shadow-sm text-xs"
                >
                  {lang.label}
                </TabsTrigger>
              ))}
            </TabsList>

            {LANGUAGES.map((lang) => (
              <TabsContent key={lang.code} value={lang.code} className="mt-4 space-y-4">
                {/* 标题 */}
                <div className="space-y-1">
                  <Label className="text-xs text-gray-500">标题</Label>
                  <Input
                    value={titles[lang.code]}
                    onChange={(e) => handleTitleChange(lang.code, e.target.value)}
                    placeholder={`${lang.label} 标题`}
                  />
                </div>

                {/* 卖点 */}
                <div className="space-y-1">
                  <Label className="text-xs text-gray-500">卖点</Label>
                  {bullets[lang.code].map((bullet, idx) => (
                    <Input
                      key={idx}
                      value={bullet}
                      onChange={(e) => handleBulletChange(lang.code, idx, e.target.value)}
                      placeholder={`卖点 ${idx + 1}`}
                      className="mb-1"
                    />
                  ))}
                </div>

                {/* 描述 */}
                <div className="space-y-1">
                  <Label className="text-xs text-gray-500">详细描述</Label>
                  <Textarea
                    value={descriptions[lang.code]}
                    onChange={(e) => handleDescriptionChange(lang.code, e.target.value)}
                    placeholder={`${lang.label} 描述`}
                    rows={5}
                  />
                </div>
              </TabsContent>
            ))}
          </Tabs>

          {/* ─── v2.0 俄文营销海报画廒 ───────────────────────── */}
          {(result.marketing_images && result.marketing_images.length > 0) && (
            <div className="space-y-2">
              <Label className="flex items-center gap-1">
                <ImageIcon className="w-4 h-4" />
                俄文营销海报（后台逐张生成，点击放大）
              </Label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {result.marketing_images.map((mi, idx) => {
                  const isReady = mi.status === 'completed' && mi.url;
                  const isFailed = mi.status === 'failed';
                  return (
                    <div
                      key={mi.id || idx}
                      className={`relative rounded-lg overflow-hidden border-2 aspect-square ${
                        isReady ? 'border-purple-300' : 'border-gray-200'
                      } bg-gray-50 flex items-center justify-center`}
                    >
                      {isReady ? (
                        <>
                          <img
                            src={mi.url}
                            alt={`营销海报 ${idx + 1}`}
                            className="w-full h-full object-cover cursor-pointer"
                            onClick={() => setPreviewImage(mi.url)}
                          />
                          <button
                            type="button"
                            onClick={() => setPreviewImage(mi.url)}
                            className="absolute top-2 right-2 p-1.5 bg-black bg-opacity-50 rounded-full text-white hover:bg-opacity-70 z-10"
                          >
                            <ZoomIn className="w-4 h-4" />
                          </button>
                          {mi.ru_caption && (
                            <div className="absolute bottom-0 left-0 right-0 bg-black bg-opacity-60 px-2 py-1 text-[11px] leading-tight text-white line-clamp-2">
                              {mi.ru_caption}
                            </div>
                          )}
                        </>
                      ) : isFailed ? (
                        <div className="text-xs text-red-500 text-center px-2">生成失败</div>
                      ) : (
                        <div className="flex flex-col items-center gap-2 text-xs text-gray-400">
                          <div className="w-8 h-8 border-2 border-purple-300 border-t-transparent rounded-full animate-spin" />
                          <span>后台生成中…</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              <p className="text-xs text-gray-500">
                已完成 {result.marketing_images.filter((m) => m.status === 'completed').length} / {result.marketing_images.length} 张（保存时会将成功的海报一同写入商品图库）
              </p>
            </div>
          )}

          {/* ─── 旧次背景图选择（向下兼容） ───────────────────────────────────────── */}
          {result.background_images.length > 0 && (
            <div className="space-y-2">
              <Label className="flex items-center gap-1">
                <ImageIcon className="w-4 h-4" />
                AI 生成背景图（点击放大，勾选入库）
              </Label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {result.background_images.map((url, index) => (
                  <div
                    key={index}
                    className={`relative rounded-lg overflow-hidden border-2 transition-all ${
                      selectedImages.has(index)
                        ? 'border-purple-500 ring-2 ring-purple-200'
                        : 'border-gray-200 opacity-60'
                    }`}
                  >
                    <img
                      src={url}
                      alt={`背景图 ${index + 1}`}
                      className="w-full aspect-square object-cover cursor-pointer"
                      onClick={() => setPreviewImage(url)}
                    />
                    {/* 放大按钮 */}
                    <button
                      type="button"
                      onClick={() => setPreviewImage(url)}
                      className="absolute top-2 right-2 p-1.5 bg-black bg-opacity-50 rounded-full text-white hover:bg-opacity-70 z-10"
                    >
                      <ZoomIn className="w-4 h-4" />
                    </button>
                    {/* 勾选框 */}
                    <div className="absolute bottom-0 left-0 right-0 bg-black bg-opacity-50 p-2 flex items-center gap-2">
                      <Checkbox
                        checked={selectedImages.has(index)}
                        onCheckedChange={() => toggleImageSelection(index)}
                      />
                      <span className="text-white text-xs">
                        {selectedImages.has(index) ? '已选中' : '未选中'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
              <p className="text-xs text-gray-500">
                已选择 {selectedImages.size} / {result.background_images.length} 张背景图
              </p>
            </div>
          )}

          {/* AI 商品理解预览（只读展示） */}
          {result.analysis?.ai_understanding && (
            <div className="bg-gradient-to-br from-amber-50 via-orange-50 to-rose-50 rounded-xl p-4 space-y-4 border border-amber-100/50">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <p className="text-sm font-semibold text-amber-800">AI 商品理解（将保存到商品详情页）</p>
                <div className="flex items-center gap-2 flex-wrap text-xs text-amber-700">
                  <span>
                    生成模式：{result.analysis.ai_understanding.source_language === 'multi'
                      ? '事实层 + 多语言直出'
                      : result.analysis.ai_understanding.source_language === 'tg'
                        ? '塔语直出'
                        : result.analysis.ai_understanding.source_language === 'ru'
                          ? '俄语直出'
                          : '兼容旧数据'}
                  </span>
                  {result.analysis.ai_understanding.primary_market_language && (
                    <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-200">
                      主市场语言：{result.analysis.ai_understanding.primary_market_language === 'tg'
                        ? '塔吉克语'
                        : result.analysis.ai_understanding.primary_market_language === 'ru'
                          ? '俄语'
                          : '中文'}
                    </span>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                {LANGUAGES.map((lang) => {
                  const targetPeople = getLocalizedAIText(result.analysis?.ai_understanding?.target_people, lang.code);
                  const sellingAngle = getLocalizedAIText(result.analysis?.ai_understanding?.selling_angle, lang.code);
                  const howToUse = getLocalizedAIText(result.analysis?.ai_understanding?.how_to_use, lang.code);
                  const bestScene = getLocalizedAIText(result.analysis?.ai_understanding?.best_scene, lang.code);
                  const localLifeConnection = getLocalizedAIText(result.analysis?.ai_understanding?.local_life_connection, lang.code);
                  const recommendedBadge = getLocalizedAIText(result.analysis?.ai_understanding?.recommended_badge, lang.code);
                  const hasContent = targetPeople || sellingAngle || howToUse || bestScene || localLifeConnection || recommendedBadge;

                  if (!hasContent) return null;

                  return (
                    <div key={lang.code} className="rounded-lg border border-white/70 bg-white/70 p-3 space-y-3">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-semibold text-gray-800">{lang.label}</p>
                        {recommendedBadge && (
                          <span className="inline-block px-2 py-0.5 bg-purple-100 text-purple-700 rounded-full text-xs font-medium">
                            {recommendedBadge}
                          </span>
                        )}
                      </div>

                      {targetPeople && (
                        <div className="text-sm">
                          <span className="font-medium text-amber-700">目标人群：</span>
                          <span className="text-gray-700 ml-1">{targetPeople}</span>
                        </div>
                      )}
                      {sellingAngle && (
                        <div className="text-sm">
                          <span className="font-medium text-rose-700">卖点：</span>
                          <span className="text-gray-700 ml-1">{sellingAngle}</span>
                        </div>
                      )}
                      {howToUse && (
                        <div className="text-sm">
                          <span className="font-medium text-sky-700">如何使用：</span>
                          <span className="text-gray-700 ml-1">{howToUse}</span>
                        </div>
                      )}
                      {bestScene && (
                        <div className="text-sm">
                          <span className="font-medium text-orange-700">使用场景：</span>
                          <span className="text-gray-700 ml-1">{bestScene}</span>
                        </div>
                      )}
                      {localLifeConnection && (
                        <div className="text-sm">
                          <span className="font-medium text-teal-700">本地关联：</span>
                          <span className="text-gray-700 ml-1">{localLifeConnection}</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {result.analysis.ai_understanding.semantic_facts && (
                <div className="rounded-lg border border-dashed border-amber-200 bg-white/60 p-3 space-y-2">
                  <p className="text-xs font-semibold tracking-wide text-amber-800 uppercase">Semantic Facts</p>
                  {result.analysis.ai_understanding.semantic_facts.parameter_highlights?.length ? (
                    <div className="text-sm text-gray-700">
                      <span className="font-medium text-gray-900">参数亮点：</span>
                      <span className="ml-1">{result.analysis.ai_understanding.semantic_facts.parameter_highlights.join('；')}</span>
                    </div>
                  ) : null}
                  {result.analysis.ai_understanding.semantic_facts.usage_scenarios?.length ? (
                    <div className="text-sm text-gray-700">
                      <span className="font-medium text-gray-900">典型场景：</span>
                      <span className="ml-1">{result.analysis.ai_understanding.semantic_facts.usage_scenarios.join('；')}</span>
                    </div>
                  ) : null}
                  {result.analysis.ai_understanding.semantic_facts.usage_steps?.length ? (
                    <div className="text-sm text-gray-700">
                      <span className="font-medium text-gray-900">使用提示：</span>
                      <span className="ml-1">{result.analysis.ai_understanding.semantic_facts.usage_steps.join('；')}</span>
                    </div>
                  ) : null}
                </div>
              )}
            </div>
          )}

          {/* 无背景图提示（partial 状态） */}
          {result.background_images.length === 0 && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 text-sm text-yellow-800">
              抠图或背景生成未成功，仅生成了文案。您可以使用原始商品图片入库，或稍后重试。
            </div>
          )}

          {/* ─── 操作按钮 ─────────────────────────────────── */}
          <div className="flex gap-3 pt-2">
            <Button
              onClick={handleSave}
              disabled={saving}
              className="flex-1 bg-purple-600 hover:bg-purple-700 text-white"
            >
              {saving ? (
                <>
                  <span className="animate-spin mr-2">&#9696;</span>
                  入库中...
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4 mr-2" />
                  确认入库
                </>
              )}
            </Button>
            <Button
              variant="outline"
              onClick={onDiscard}
              disabled={saving}
            >
              <XCircle className="w-4 h-4 mr-2" />
              放弃
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* ─── 图片放大预览 Modal ──────────────────────────── */}
      {previewImage && (
        <div
          className="fixed inset-0 z-50 bg-black bg-opacity-80 flex items-center justify-center p-4"
          onClick={() => setPreviewImage(null)}
        >
          <button
            className="absolute top-4 right-4 p-2 bg-white rounded-full text-gray-800 hover:bg-gray-200 z-50"
            onClick={() => setPreviewImage(null)}
          >
            <X className="w-6 h-6" />
          </button>
          <img
            src={previewImage}
            alt="预览大图"
            className="max-w-full max-h-full object-contain rounded-lg"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </>
  );
};
