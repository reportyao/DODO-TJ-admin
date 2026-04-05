import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
import { Link } from 'wouter';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import {
  Copy,
  Send,
  MessageSquare,
  Image,
  BookOpen,
  ArrowRight,
  CheckCircle,
  Gift,
  Shield,
  Coins,
  Users,
  Sparkles,
  ChevronRight,
  Info,
  Star,
  Zap,
  BadgePercent,
  TrendingUp,
} from 'lucide-react';

const INVITE_LINK_PREFIX = 'https://t.me/tezbarakatbot/shoppp?startapp=';

// Onboarding modal for first-time visitors
function OnboardingModal({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const [step, setStep] = useState(0);

  const steps = [
    {
      emoji: '👋',
      title: t('onboarding.step1Title'),
      desc: t('onboarding.step1Desc'),
      color: 'from-[#0D7C66] to-[#0a6b58]',
    },
    {
      emoji: '💰',
      title: t('onboarding.step2Title'),
      desc: t('onboarding.step2Desc'),
      color: 'from-[#D4AF37] to-[#c9a432]',
    },
    {
      emoji: '✅',
      title: t('onboarding.step3Title'),
      desc: t('onboarding.step3Desc'),
      color: 'from-green-500 to-green-600',
    },
  ];

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
    >
      <motion.div
        initial={{ scale: 0.9, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        className="bg-white rounded-3xl max-w-sm w-full overflow-hidden shadow-2xl"
      >
        <div className={`bg-gradient-to-br ${steps[step].color} p-8 text-center`}>
          <motion.span
            key={step}
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            className="text-6xl block mb-4"
          >
            {steps[step].emoji}
          </motion.span>
          <h2 className="text-2xl font-bold text-white mb-2">{steps[step].title}</h2>
          <p className="text-white/90">{steps[step].desc}</p>
        </div>

        <div className="p-6">
          {/* Progress dots */}
          <div className="flex justify-center gap-2 mb-6">
            {steps.map((_, i) => (
              <div
                key={i}
                className={`w-3 h-3 rounded-full transition-all ${
                  i === step ? 'bg-[#0D7C66] w-8' : 'bg-gray-200'
                }`}
              />
            ))}
          </div>

          <div className="flex gap-3">
            {step < steps.length - 1 ? (
              <>
                <Button
                  variant="outline"
                  onClick={onClose}
                  className="flex-1"
                >
                  {t('common.skip')}
                </Button>
                <Button
                  onClick={() => setStep(step + 1)}
                  className="flex-1 bg-[#0D7C66] hover:bg-[#0a6b58]"
                >
                  {t('common.next')}
                  <ArrowRight className="w-4 h-4 ml-1" />
                </Button>
              </>
            ) : (
              <Button
                onClick={onClose}
                className="w-full bg-[#0D7C66] hover:bg-[#0a6b58] h-12 text-lg"
              >
                {t('onboarding.startNow')}
                <Sparkles className="w-5 h-5 ml-2" />
              </Button>
            )}
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

// Earnings Calculator Component
function EarningsCalculator() {
  const { t } = useTranslation();
  const [invites, setInvites] = useState(10);
  const [avgPurchase, setAvgPurchase] = useState(100);

  const level1 = invites * avgPurchase * 0.10;
  const level2 = invites * 5 * avgPurchase * 0.04;
  const level3 = invites * 5 * 5 * avgPurchase * 0.01;
  const total = level1 + level2 + level3;

  return (
    <Card className="border-2 border-[#D4AF37]/30 bg-gradient-to-br from-[#D4AF37]/5 to-transparent">
      <CardContent className="p-5">
        <h3 className="font-bold text-lg text-gray-900 mb-4 flex items-center gap-2">
          <Coins className="w-5 h-5 text-[#D4AF37]" />
          {t('calculator.title')}
        </h3>

        <div className="space-y-4 mb-4">
          <div>
            <label className="text-sm text-gray-600 mb-1 block">{t('calculator.invites')}</label>
            <Input
              type="number"
              value={invites}
              onChange={(e) => setInvites(Number(e.target.value) || 0)}
              className="border-2 text-center text-lg font-bold"
            />
          </div>
          <div>
            <label className="text-sm text-gray-600 mb-1 block">{t('calculator.avgPurchase')}</label>
            <Input
              type="number"
              value={avgPurchase}
              onChange={(e) => setAvgPurchase(Number(e.target.value) || 0)}
              className="border-2 text-center text-lg font-bold"
            />
          </div>
        </div>

        <div className="bg-white rounded-xl p-4 space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">{t('calculator.level1Income')}</span>
            <span className="font-bold text-[#0D7C66]">{level1.toFixed(0)} TJS</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">{t('calculator.level2Income')}</span>
            <span className="font-bold text-[#0D7C66]">{level2.toFixed(0)} TJS</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">{t('calculator.level3Income')}</span>
            <span className="font-bold text-[#0D7C66]">{level3.toFixed(0)} TJS</span>
          </div>
          <div className="border-t pt-2 mt-2 flex justify-between">
            <span className="font-bold text-gray-900">{t('calculator.youWillEarn')}</span>
            <span className="font-bold text-xl text-[#D4AF37]">{total.toFixed(0)} TJS/{t('calculator.title').includes('моҳ') ? '' : 'моҳ'}</span>
          </div>
          <div className="text-xs text-gray-500 mt-3 pt-3 border-t">
            {t('calculator.pointsHint')}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function Home() {
  const { t } = useTranslation();
  const [inviteCode, setInviteCode] = useState('');
  const [generatedLink, setGeneratedLink] = useState('');
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [showCalculator, setShowCalculator] = useState(false);

  useEffect(() => {
    const hasSeenOnboarding = localStorage.getItem('tez_onboarding_seen');
    if (!hasSeenOnboarding) {
      setShowOnboarding(true);
    }
  }, []);

  const handleCloseOnboarding = () => {
    localStorage.setItem('tez_onboarding_seen', 'true');
    setShowOnboarding(false);
  };

  const handleGenerateLink = () => {
    if (!inviteCode.trim()) {
      toast.error(t('home.codeRequired'));
      return;
    }
    const cleanCode = inviteCode.trim().toUpperCase();
    if (!/^[A-Z0-9]+$/.test(cleanCode)) {
      toast.error(t('home.invalidCode'));
      return;
    }
    const link = `${INVITE_LINK_PREFIX}${cleanCode}`;
    setGeneratedLink(link);
    toast.success(t('common.success'));
  };

  const handleCopyLink = async () => {
    await navigator.clipboard.writeText(generatedLink);
    toast.success(t('common.copied'));
  };

  const handleShareTelegram = () => {
    const text = encodeURIComponent(t('scripts.bestScript1') + '\n\n' + generatedLink);
    window.open(`https://t.me/share/url?text=${text}`, '_blank');
  };

  const quickActions = [
    {
      icon: <MessageSquare className="w-7 h-7" />,
      title: t('home.actionScripts'),
      desc: t('home.actionScriptsDesc'),
      href: '/scripts',
      color: 'bg-blue-500',
      bgColor: 'bg-blue-50',
    },
    {
      icon: <Image className="w-7 h-7" />,
      title: t('home.actionMaterials'),
      desc: t('home.actionMaterialsDesc'),
      href: '/materials',
      color: 'bg-amber-500',
      bgColor: 'bg-amber-50',
    },
    {
      icon: <BookOpen className="w-7 h-7" />,
      title: t('home.actionGuide'),
      desc: t('home.actionGuideDesc'),
      href: '/guide',
      color: 'bg-purple-500',
      bgColor: 'bg-purple-50',
    },
  ];

  return (
    <div className="min-h-screen pb-24 bg-gradient-to-b from-gray-50 to-white">
      {/* Onboarding Modal */}
      <AnimatePresence>
        {showOnboarding && <OnboardingModal onClose={handleCloseOnboarding} />}
      </AnimatePresence>

      {/* Hero Section - Super Simple */}
      <section className="tez-gradient-green py-8 relative overflow-hidden">
        <div className="absolute inset-0 opacity-20">
          <div className="absolute top-10 right-10 w-40 h-40 bg-[#D4AF37] rounded-full blur-3xl"></div>
          <div className="absolute bottom-10 left-10 w-32 h-32 bg-white rounded-full blur-3xl"></div>
        </div>
        
        <div className="container relative">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center"
          >
            <div className="inline-flex items-center justify-center w-20 h-20 bg-white/20 rounded-3xl mb-4 backdrop-blur-sm">
              <span className="text-5xl">💰</span>
            </div>
            <h1 className="text-3xl font-bold text-white mb-2">
              {t('home.heroSimple')}
            </h1>
            <p className="text-white/90 text-lg">
              {t('home.heroSimpleDesc')}
            </p>
          </motion.div>
        </div>
      </section>

      {/* 💰 10 Million Subsidy Banner - KEY MARKETING MESSAGE */}
      <section className="container py-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.05 }}
        >
          <Link href="/platform#subsidy">
            <Card className="cursor-pointer bg-gradient-to-r from-[#D4AF37] via-[#f0d878] to-[#D4AF37] border-0 shadow-lg hover:shadow-xl transition-all overflow-hidden relative">
              <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHZpZXdCb3g9IjAgMCA0MCA0MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxjaXJjbGUgZmlsbD0iI2ZmZiIgZmlsbC1vcGFjaXR5PSIuMSIgY3g9IjIwIiBjeT0iMjAiIHI9IjMiLz48L2c+PC9zdmc+')] opacity-30"></div>
              <CardContent className="p-4 relative">
                <div className="flex items-center gap-3">
                  <div className="w-14 h-14 bg-white/30 rounded-2xl flex items-center justify-center shrink-0 backdrop-blur-sm">
                    <span className="text-3xl">🎁</span>
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded-full animate-pulse">
                        {t('subsidy.badge')}
                      </span>
                    </div>
                    <h3 className="font-bold text-white text-lg drop-shadow-sm">
                      {t('subsidy.title')}
                    </h3>
                    <p className="text-white/90 text-sm">
                      {t('subsidy.heroTitle')} {t('subsidy.heroAnswer')}
                    </p>
                  </div>
                  <ChevronRight className="w-6 h-6 text-white/80" />
                </div>
              </CardContent>
            </Card>
          </Link>
        </motion.div>
      </section>

      {/* STEP 1: Generate Link - Most Important */}
      <section className="container py-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <Card className="border-2 border-[#0D7C66] shadow-lg overflow-hidden">
            <div className="bg-[#0D7C66] px-4 py-3">
              <div className="flex items-center gap-2 text-white">
                <div className="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center font-bold">
                  1
                </div>
                <span className="font-bold text-lg">{t('home.step1Label')}</span>
              </div>
            </div>
            
            <CardContent className="p-5">
              {!generatedLink ? (
                <div className="space-y-4">
                  <p className="text-gray-600 text-center">
                    {t('home.enterCodeSimple')}
                  </p>
                  
                  <Input
                    type="text"
                    placeholder={t('home.codePlaceholder')}
                    value={inviteCode}
                    onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                    className="text-center text-2xl font-bold h-16 border-2 border-gray-200 focus:border-[#0D7C66] tracking-widest"
                    maxLength={20}
                  />
                  
                  <div className="flex items-center gap-2 text-sm text-gray-500 justify-center">
                    <Info className="w-4 h-4" />
                    <span>{t('home.whereToFind')}</span>
                  </div>
                  
                  <Button
                    onClick={handleGenerateLink}
                    className="w-full h-14 text-lg font-bold bg-[#0D7C66] hover:bg-[#0a6b58]"
                  >
                    {t('home.generateSimple')}
                    <ArrowRight className="w-5 h-5 ml-2" />
                  </Button>
                </div>
              ) : (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="space-y-4"
                >
                  <div className="text-center">
                    <div className="inline-flex items-center justify-center w-16 h-16 bg-green-100 rounded-full mb-3">
                      <CheckCircle className="w-8 h-8 text-green-600" />
                    </div>
                    <h3 className="text-xl font-bold text-gray-900">{t('home.linkReady')}</h3>
                  </div>
                  
                  <div className="bg-gray-100 rounded-xl p-4">
                    <p className="text-sm font-mono text-gray-700 break-all text-center">
                      {generatedLink}
                    </p>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-3">
                    <Button
                      onClick={handleCopyLink}
                      className="h-12 bg-[#0D7C66] hover:bg-[#0a6b58]"
                    >
                      <Copy className="w-5 h-5 mr-2" />
                      {t('home.copyLink')}
                    </Button>
                    <Button
                      onClick={handleShareTelegram}
                      variant="outline"
                      className="h-12 border-2 border-[#0D7C66] text-[#0D7C66] hover:bg-[#0D7C66]/10"
                    >
                      <Send className="w-5 h-5 mr-2" />
                      Telegram
                    </Button>
                  </div>
                  
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setGeneratedLink('');
                      setInviteCode('');
                    }}
                    className="w-full text-gray-500"
                  >
                    {t('home.generateAnother')}
                  </Button>
                </motion.div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </section>

      {/* STEP 2: What You Need */}
      <section className="container pb-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <div className="flex items-center gap-2 mb-4">
            <div className="w-8 h-8 bg-[#D4AF37] rounded-lg flex items-center justify-center font-bold text-white">
              2
            </div>
            <span className="font-bold text-lg text-gray-900">{t('home.whatYouNeed')}</span>
          </div>

          <div className="space-y-3">
            {quickActions.map((action, index) => (
              <motion.div
                key={action.href}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.3 + index * 0.1 }}
              >
                <Link href={action.href}>
                  <Card className="cursor-pointer hover:shadow-lg transition-all border-2 border-transparent hover:border-[#0D7C66]/30">
                    <CardContent className="p-4">
                      <div className="flex items-center gap-4">
                        <div className={`w-14 h-14 ${action.color} rounded-2xl flex items-center justify-center text-white shrink-0`}>
                          {action.icon}
                        </div>
                        <div className="flex-1">
                          <h3 className="font-bold text-gray-900 text-lg">{action.title}</h3>
                          <p className="text-gray-500 text-sm">{action.desc}</p>
                        </div>
                        <ChevronRight className="w-6 h-6 text-gray-400" />
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              </motion.div>
            ))}
          </div>
        </motion.div>
      </section>

      {/* Earnings Calculator Toggle */}
      <section className="container pb-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
        >
          <Button
            variant="outline"
            onClick={() => setShowCalculator(!showCalculator)}
            className="w-full h-14 border-2 border-[#D4AF37] text-[#D4AF37] hover:bg-[#D4AF37]/10"
          >
            <Coins className="w-5 h-5 mr-2" />
            {t('platform.referralCalc')}
            <ChevronRight className={`w-5 h-5 ml-auto transition-transform ${showCalculator ? 'rotate-90' : ''}`} />
          </Button>

          <AnimatePresence>
            {showCalculator && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden mt-3"
              >
                <EarningsCalculator />
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </section>

      {/* Trust Badges */}
      <section className="container pb-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
        >
          <div className="grid grid-cols-3 gap-3">
            <Card className="text-center p-4 bg-gradient-to-br from-green-50 to-white border-green-100">
              <Shield className="w-8 h-8 text-green-600 mx-auto mb-2" />
              <p className="text-xs font-medium text-gray-600">100%</p>
              <p className="text-sm font-bold text-gray-900">{t('home.statSafe')}</p>
            </Card>
            <Card className="text-center p-4 bg-gradient-to-br from-amber-50 to-white border-amber-100">
              <Coins className="w-8 h-8 text-amber-600 mx-auto mb-2" />
              <p className="text-xs font-medium text-gray-600">~450</p>
              <p className="text-sm font-bold text-gray-900">{t('home.statAvgEarning')}</p>
            </Card>
            <Card className="text-center p-4 bg-gradient-to-br from-blue-50 to-white border-blue-100">
              <Users className="w-8 h-8 text-blue-600 mx-auto mb-2" />
              <p className="text-xs font-medium text-gray-600">3000+</p>
              <p className="text-sm font-bold text-gray-900">{t('home.statPromoters')}</p>
            </Card>
          </div>
        </motion.div>
      </section>

      {/* Learn More About Platform */}
      <section className="container pb-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.7 }}
        >
          <Link href="/platform">
            <Card className="cursor-pointer bg-gradient-to-r from-[#0D7C66]/10 to-[#D4AF37]/10 border-2 border-[#0D7C66]/20 hover:shadow-lg transition-all">
              <CardContent className="p-5">
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 bg-gradient-to-br from-[#0D7C66] to-[#0a6b58] rounded-2xl flex items-center justify-center">
                    <Star className="w-7 h-7 text-white" />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-bold text-gray-900 text-lg">{t('home.learnPlatform')}</h3>
                    <p className="text-gray-500 text-sm">{t('home.learnPlatformDesc')}</p>
                  </div>
                  <ChevronRight className="w-6 h-6 text-[#0D7C66]" />
                </div>
              </CardContent>
            </Card>
          </Link>
        </motion.div>
      </section>
    </div>
  );
}
