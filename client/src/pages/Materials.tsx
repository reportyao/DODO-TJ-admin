import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { CopyButton } from '@/components/CopyButton';
import { DownloadButton } from '@/components/DownloadButton';
import { toast } from 'sonner';
import {
  Image,
  FileText,
  Video,
  Download,
  Send,
  Lightbulb,
  MessageSquare,
  ChevronDown,
  ChevronUp,
  Star,
  Package,
  Sparkles,
  Play,
  Copy,
  Check,
  X,
} from 'lucide-react';

const INVITE_LINK_PREFIX = 'https://t.me/tezbarakatbot/shoppp?startapp=';

export default function Materials() {
  const { t } = useTranslation();
  const [activeSection, setActiveSection] = useState<string | null>('posters');
  const [requestText, setRequestText] = useState('');
  const [contactInfo, setContactInfo] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showAllPosters, setShowAllPosters] = useState(false);
  const [showAllTexts, setShowAllTexts] = useState(false);
  const [selectedPoster, setSelectedPoster] = useState<number | null>(null);

  // Official posters from TezBarakat
  const posters = [
    // Official TezBarakat infographics
    { id: 1, src: '/images/01-GroupBuy-Infographic-TJ.webp', name: t('materials.poster1'), filename: '01-GroupBuy-Infographic-TJ.webp', isOfficial: true, category: 'official' },
    { id: 2, src: '/images/02-Referral-Infographic-TJ.webp', name: t('materials.poster2'), filename: '02-Referral-Infographic-TJ.webp', isOfficial: true, category: 'official' },
    { id: 3, src: '/images/03-PointsMall-Infographic-TJ.webp', name: t('materials.poster3'), filename: '03-PointsMall-Infographic-TJ.webp', isOfficial: true, category: 'official' },
    { id: 4, src: '/images/04-QuickStart-Infographic-TJ.webp', name: t('materials.poster4'), filename: '04-QuickStart-Infographic-TJ.webp', isOfficial: true, category: 'official' },
    { id: 5, src: '/images/05-FundSafety-Infographic-TJ.webp', name: t('materials.poster5'), filename: '05-FundSafety-Infographic-TJ.webp', isOfficial: true, category: 'official' },
    { id: 6, src: '/images/06-SpinWheel-Poster-TJ.webp', name: t('materials.poster6'), filename: '06-SpinWheel-Poster-TJ.webp', isOfficial: true, category: 'official' },
    // New promotional posters
    { id: 7, src: '/images/poster-student.webp', name: t('materials.posterStudent'), filename: 'poster-student.webp', isOfficial: false, category: 'promo' },
    { id: 8, src: '/images/poster-family.webp', name: t('materials.posterFamily'), filename: 'poster-family.webp', isOfficial: false, category: 'promo' },
    { id: 9, src: '/images/poster-telegram.webp', name: t('materials.posterTelegram'), filename: 'poster-telegram.webp', isOfficial: false, category: 'promo' },
    { id: 10, src: '/images/poster-winner.webp', name: t('materials.posterWinner'), filename: 'poster-winner.webp', isOfficial: false, category: 'promo' },
    { id: 11, src: '/images/poster-commission.webp', name: t('materials.posterCommission'), filename: 'poster-commission.webp', isOfficial: false, category: 'promo' },
    { id: 12, src: '/images/poster-earn-money.webp', name: t('materials.poster7'), filename: 'poster-earn-money.webp', isOfficial: false, category: 'promo' },
  ];

  const copyTexts = [
    { id: 1, text: t('materials.text1'), emoji: '🎁', category: 'intro' },
    { id: 2, text: t('materials.text2'), emoji: '💰', category: 'referral' },
    { id: 3, text: t('materials.text3'), emoji: '🛒', category: 'points' },
    { id: 4, text: t('materials.text4'), emoji: '📱', category: 'product' },
    { id: 5, text: t('materials.text5'), emoji: '🎉', category: 'success' },
    { id: 6, text: t('materials.text6'), emoji: '💼', category: 'income' },
    { id: 7, text: t('materials.text7'), emoji: '🎁', category: 'referral' },
    { id: 8, text: t('materials.text8'), emoji: '✨', category: 'intro' },
    { id: 9, text: t('materials.text9'), emoji: '🏆', category: 'success' },
    { id: 10, text: t('materials.text10'), emoji: '📚', category: 'student' },
  ];

  const videoIdeas = [
    { id: 1, title: t('materials.videoIdea1.title'), script: t('materials.videoIdea1.script'), emoji: '📱' },
    { id: 2, title: t('materials.videoIdea2.title'), script: t('materials.videoIdea2.script'), emoji: '💰' },
    { id: 3, title: t('materials.videoIdea3.title'), script: t('materials.videoIdea3.script'), emoji: '❓' },
    { id: 4, title: t('materials.videoIdea4.title'), script: t('materials.videoIdea4.script'), emoji: '📚' },
    { id: 5, title: t('materials.videoIdea5.title'), script: t('materials.videoIdea5.script'), emoji: '🚀' },
  ];

  const handleSubmitRequest = async () => {
    if (!requestText.trim()) {
      toast.error(t('common.error'));
      return;
    }
    setIsSubmitting(true);
    await new Promise(resolve => setTimeout(resolve, 1000));
    toast.success(t('request.successMsg'));
    setRequestText('');
    setContactInfo('');
    setIsSubmitting(false);
  };

  const handleDownloadAll = () => {
    posters.forEach((poster, index) => {
      setTimeout(() => {
        const link = document.createElement('a');
        link.href = poster.src;
        link.download = poster.filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }, index * 500);
    });
    toast.success(t('common.downloaded'));
  };

  const sections = [
    { id: 'posters', icon: <Image className="w-6 h-6" />, label: t('materials.posters'), color: 'bg-amber-500', count: posters.length },
    { id: 'texts', icon: <FileText className="w-6 h-6" />, label: t('materials.copyTexts'), color: 'bg-blue-500', count: copyTexts.length },
    { id: 'videos', icon: <Video className="w-6 h-6" />, label: t('materials.videoIdeas'), color: 'bg-purple-500', count: videoIdeas.length },
    { id: 'request', icon: <MessageSquare className="w-6 h-6" />, label: t('request.title'), color: 'bg-teal-500', count: null },
  ];

  return (
    <div className="min-h-screen pb-24 bg-gradient-to-b from-gray-50 to-white">
      {/* Hero - Simple */}
      <section className="tez-gradient-green py-8 relative overflow-hidden">
        <div className="absolute inset-0 opacity-20">
          <div className="absolute top-5 left-5 w-32 h-32 bg-[#D4AF37] rounded-full blur-3xl"></div>
        </div>
        <div className="container relative text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <div className="inline-flex items-center justify-center w-16 h-16 bg-white/20 rounded-2xl mb-4">
              <span className="text-4xl">📸</span>
            </div>
            <h1 className="text-2xl font-bold text-white mb-2">
              {t('materials.heroTitle')}
            </h1>
            <p className="text-white/90">{t('materials.heroDesc')}</p>
          </motion.div>
        </div>
      </section>

      {/* Quick Download All - Most Important Action */}
      <section className="container py-6">
        <Card className="bg-gradient-to-r from-[#D4AF37] to-[#c9a432] border-0 overflow-hidden">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center">
                  <Package className="w-6 h-6 text-white" />
                </div>
                <div className="text-white">
                  <h3 className="font-bold text-lg">{t('materials.quickDownload')}</h3>
                  <p className="text-white/80 text-sm">{t('materials.quickDownloadDesc')}</p>
                </div>
              </div>
              <Button
                onClick={handleDownloadAll}
                className="bg-white text-[#D4AF37] hover:bg-white/90 gap-2 font-bold"
              >
                <Download className="w-5 h-5" />
                {t('materials.downloadAll')}
              </Button>
            </div>
          </CardContent>
        </Card>
      </section>

      <div className="container pb-6">
        {/* Section Navigation */}
        <div className="grid grid-cols-4 gap-2 mb-6">
          {sections.map((section) => (
            <Button
              key={section.id}
              variant={activeSection === section.id ? 'default' : 'outline'}
              onClick={() => setActiveSection(activeSection === section.id ? null : section.id)}
              className={`flex flex-col items-center gap-1 h-auto py-3 ${
                activeSection === section.id 
                  ? 'bg-[#0D7C66] hover:bg-[#0a6b58]' 
                  : ''
              }`}
            >
              {section.icon}
              <span className="text-xs">{section.label}</span>
              {section.count && (
                <span className={`text-xs px-2 py-0.5 rounded-full ${
                  activeSection === section.id ? 'bg-white/20' : 'bg-gray-100'
                }`}>
                  {section.count}
                </span>
              )}
            </Button>
          ))}
        </div>

        {/* POSTERS SECTION */}
        <AnimatePresence>
          {activeSection === 'posters' && (
            <motion.section
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <div className="mb-4">
                <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                  <Star className="w-5 h-5 text-[#D4AF37]" />
                  {t('materials.posters')}
                </h2>
                <p className="text-sm text-gray-500">{t('materials.postersDesc')}</p>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {posters.slice(0, showAllPosters ? posters.length : 4).map((poster, index) => (
                  <motion.div
                    key={poster.id}
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: index * 0.05 }}
                  >
                    <Card className="overflow-hidden border-2 border-gray-100 hover:border-[#0D7C66]/30 transition-all">
                      <div 
                        className="aspect-[3/4] overflow-hidden bg-gray-100 cursor-pointer relative"
                        onClick={() => setSelectedPoster(poster.id)}
                      >
                        <img
                          src={poster.src}
                          alt={poster.name}
                          className="w-full h-full object-cover hover:scale-105 transition-transform"
                          loading="lazy"
                        />
                        {poster.isOfficial && (
                          <div className="absolute top-2 left-2 bg-[#0D7C66] text-white text-xs px-2 py-1 rounded-full flex items-center gap-1">
                            <Check className="w-3 h-3" />
                            Official
                          </div>
                        )}
                      </div>
                      <CardContent className="p-3">
                        <p className="text-sm font-medium text-gray-800 mb-2 truncate">{poster.name}</p>
                        <DownloadButton
                          url={poster.src}
                          filename={poster.filename}
                          className="w-full"
                          variant="outline"
                          size="sm"
                        />
                      </CardContent>
                    </Card>
                  </motion.div>
                ))}
              </div>

              {posters.length > 4 && (
                <Button
                  variant="ghost"
                  onClick={() => setShowAllPosters(!showAllPosters)}
                  className="w-full mt-4 text-[#0D7C66]"
                >
                  {showAllPosters ? (
                    <>
                      <ChevronUp className="w-4 h-4 mr-1" />
                      {t('common.close')}
                    </>
                  ) : (
                    <>
                      <ChevronDown className="w-4 h-4 mr-1" />
                      {t('common.viewMore')} ({posters.length - 4})
                    </>
                  )}
                </Button>
              )}
            </motion.section>
          )}
        </AnimatePresence>

        {/* COPY TEXTS SECTION */}
        <AnimatePresence>
          {activeSection === 'texts' && (
            <motion.section
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <div className="mb-4">
                <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-[#D4AF37]" />
                  {t('materials.copyTexts')}
                </h2>
                <p className="text-sm text-gray-500">{t('materials.copyTextsDesc')}</p>
              </div>

              <div className="space-y-4">
                {copyTexts.slice(0, showAllTexts ? copyTexts.length : 3).map((item, index) => (
                  <motion.div
                    key={item.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.05 }}
                  >
                    <Card className="border-2 border-gray-100 hover:border-[#0D7C66]/30 transition-all">
                      <CardContent className="p-4">
                        <div className="flex items-start gap-3 mb-3">
                          <span className="text-2xl">{item.emoji}</span>
                          <div className="bg-gray-50 rounded-lg p-3 flex-1">
                            <p className="text-sm text-gray-700 whitespace-pre-line">{item.text}</p>
                            <p className="text-xs text-[#0D7C66] mt-2 font-mono">{INVITE_LINK_PREFIX}YOUR_CODE</p>
                          </div>
                        </div>
                        <div className="flex gap-2 justify-end">
                          <CopyButton 
                            text={item.text + INVITE_LINK_PREFIX + 'YOUR_CODE'} 
                            className="bg-[#0D7C66] hover:bg-[#0a6b58] text-white"
                          />
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              const text = encodeURIComponent(item.text + INVITE_LINK_PREFIX + 'YOUR_CODE');
                              window.open(`https://t.me/share/url?text=${text}`, '_blank');
                            }}
                            className="gap-2"
                          >
                            <Send className="w-4 h-4" />
                            Telegram
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  </motion.div>
                ))}
              </div>

              {copyTexts.length > 3 && (
                <Button
                  variant="ghost"
                  onClick={() => setShowAllTexts(!showAllTexts)}
                  className="w-full mt-4 text-[#0D7C66]"
                >
                  {showAllTexts ? (
                    <>
                      <ChevronUp className="w-4 h-4 mr-1" />
                      {t('common.close')}
                    </>
                  ) : (
                    <>
                      <ChevronDown className="w-4 h-4 mr-1" />
                      {t('common.viewMore')} ({copyTexts.length - 3})
                    </>
                  )}
                </Button>
              )}
            </motion.section>
          )}
        </AnimatePresence>

        {/* VIDEO IDEAS SECTION */}
        <AnimatePresence>
          {activeSection === 'videos' && (
            <motion.section
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <div className="mb-4">
                <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                  <Play className="w-5 h-5 text-[#D4AF37]" />
                  {t('materials.videoIdeas')}
                </h2>
                <p className="text-sm text-gray-500">{t('materials.videoIdeasDesc')}</p>
              </div>

              <div className="space-y-4">
                {videoIdeas.map((video, index) => (
                  <motion.div
                    key={video.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.1 }}
                  >
                    <Card className="overflow-hidden border-2 border-gray-100">
                      <CardHeader className="bg-gradient-to-r from-purple-500 to-pink-500 text-white py-3">
                        <CardTitle className="text-base flex items-center gap-2">
                          <span className="text-xl">{video.emoji}</span>
                          {video.title}
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="p-4">
                        <div className="bg-gray-50 rounded-lg p-4 mb-3">
                          <p className="text-sm text-gray-700 whitespace-pre-line leading-relaxed">{video.script}</p>
                        </div>
                        <CopyButton text={video.script} className="w-full" />
                      </CardContent>
                    </Card>
                  </motion.div>
                ))}
              </div>
            </motion.section>
          )}
        </AnimatePresence>

        {/* REQUEST SECTION */}
        <AnimatePresence>
          {activeSection === 'request' && (
            <motion.section
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <Card className="border-2 border-[#0D7C66]/20">
                <CardHeader className="bg-[#0D7C66]/5">
                  <CardTitle className="text-lg flex items-center gap-2 text-[#0D7C66]">
                    <MessageSquare className="w-5 h-5" />
                    {t('request.title')}
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-4 space-y-4">
                  <p className="text-sm text-gray-600">{t('request.subtitle')}</p>
                  
                  <div>
                    <Textarea
                      placeholder={t('request.placeholder')}
                      value={requestText}
                      onChange={(e) => setRequestText(e.target.value)}
                      rows={4}
                      className="resize-none border-2 focus:border-[#0D7C66]"
                    />
                  </div>
                  
                  <div>
                    <label className="text-sm text-gray-600 mb-2 block">
                      {t('request.contactInfo')}
                    </label>
                    <Input
                      placeholder={t('request.contactPlaceholder')}
                      value={contactInfo}
                      onChange={(e) => setContactInfo(e.target.value)}
                      className="border-2 focus:border-[#0D7C66]"
                    />
                  </div>
                  
                  <Button
                    onClick={handleSubmitRequest}
                    disabled={isSubmitting || !requestText.trim()}
                    className="w-full bg-[#0D7C66] hover:bg-[#0a6b58] h-12 text-base"
                  >
                    {isSubmitting ? t('common.loading') : t('request.submitBtn')}
                  </Button>
                </CardContent>
              </Card>
            </motion.section>
          )}
        </AnimatePresence>
      </div>

      {/* Image Preview Modal */}
      <AnimatePresence>
        {selectedPoster && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
            onClick={() => setSelectedPoster(null)}
          >
            <Button
              variant="ghost"
              size="icon"
              className="absolute top-4 right-4 text-white hover:bg-white/20"
              onClick={() => setSelectedPoster(null)}
            >
              <X className="w-6 h-6" />
            </Button>
            <motion.img
              initial={{ scale: 0.9 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.9 }}
              src={posters.find(p => p.id === selectedPoster)?.src}
              alt=""
              className="max-w-full max-h-[90vh] object-contain rounded-lg"
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
