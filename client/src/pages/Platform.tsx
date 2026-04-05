import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  ShoppingBag,
  Users,
  Coins,
  Shield,
  Gift,
  ChevronDown,
  ChevronUp,
  CheckCircle,
  ArrowRight,
  Wallet,
  Lock,
  Building,
  Phone,
  MapPin,
  Star,
  Sparkles,
  TrendingUp,
  Percent,
  CircleDollarSign,
  RotateCcw,
  BadgePercent,
  Rocket,
  Heart,
  GraduationCap,
  Clock,
} from 'lucide-react';

export default function Platform() {
  const { t } = useTranslation();
  const [expandedSection, setExpandedSection] = useState<string | null>('howItWorks');

  const toggleSection = (section: string) => {
    setExpandedSection(expandedSection === section ? null : section);
  };

  // How it works - 3 simple steps
  const howItWorksSteps = [
    {
      num: 1,
      icon: <CircleDollarSign className="w-8 h-8" />,
      title: t('platform.step1Simple'),
      desc: t('platform.step1SimpleDesc'),
      color: 'bg-blue-500',
    },
    {
      num: 2,
      icon: <RotateCcw className="w-8 h-8" />,
      title: t('platform.step2Simple'),
      desc: t('platform.step2SimpleDesc'),
      color: 'bg-purple-500',
    },
    {
      num: 3,
      icon: <Gift className="w-8 h-8" />,
      title: t('platform.step3Simple'),
      desc: t('platform.step3SimpleDesc'),
      color: 'bg-green-500',
    },
  ];

  // Referral levels
  const referralLevels = [
    { level: 1, percent: '10%', color: 'bg-[#0D7C66]', desc: t('platform.level1') },
    { level: 2, percent: '4%', color: 'bg-[#0D7C66]/80', desc: t('platform.level2') },
    { level: 3, percent: '1%', color: 'bg-[#0D7C66]/60', desc: t('platform.level3') },
  ];

  // Trust factors
  const trustFactors = [
    {
      icon: <Building className="w-6 h-6" />,
      title: t('platform.trust1'),
      desc: t('platform.trust1Desc'),
    },
    {
      icon: <MapPin className="w-6 h-6" />,
      title: t('platform.trust2'),
      desc: t('platform.trust2Desc'),
    },
    {
      icon: <Users className="w-6 h-6" />,
      title: t('platform.trust3'),
      desc: t('platform.trust3Desc'),
    },
  ];

  // Security features
  const securityFeatures = [
    {
      icon: <Wallet className="w-6 h-6" />,
      title: t('platform.security1'),
      desc: t('platform.security1Desc'),
    },
    {
      icon: <Lock className="w-6 h-6" />,
      title: t('platform.security2'),
      desc: t('platform.security2Desc'),
    },
    {
      icon: <Building className="w-6 h-6" />,
      title: t('platform.security3'),
      desc: t('platform.security3Desc'),
    },
  ];

  const Section = ({ 
    id, 
    icon, 
    title, 
    color, 
    children 
  }: { 
    id: string; 
    icon: React.ReactNode; 
    title: string; 
    color: string;
    children: React.ReactNode;
  }) => (
    <div className="mb-4">
      <Card 
        className={`cursor-pointer transition-all ${
          expandedSection === id 
            ? 'border-2 border-[#0D7C66] shadow-lg' 
            : 'border hover:shadow-md'
        }`}
        onClick={() => toggleSection(id)}
      >
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`w-12 h-12 ${color} rounded-xl flex items-center justify-center text-white`}>
                {icon}
              </div>
              <h3 className="font-bold text-gray-900 text-lg">{title}</h3>
            </div>
            <div className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${
              expandedSection === id ? 'bg-[#0D7C66] text-white rotate-180' : 'bg-gray-100'
            }`}>
              <ChevronDown className="w-5 h-5" />
            </div>
          </div>
        </CardContent>
      </Card>

      <AnimatePresence>
        {expandedSection === id && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="mt-2 p-4 bg-gray-50 rounded-xl">
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );

  return (
    <div className="min-h-screen pb-24 bg-gradient-to-b from-gray-50 to-white">
      {/* Hero */}
      <section className="tez-gradient-green py-8 relative overflow-hidden">
        <div className="absolute inset-0 opacity-20">
          <div className="absolute top-5 right-5 w-32 h-32 bg-[#D4AF37] rounded-full blur-3xl"></div>
        </div>
        <div className="container relative text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <div className="inline-flex items-center justify-center w-16 h-16 bg-white/20 rounded-2xl mb-4">
              <span className="text-4xl">🛒</span>
            </div>
            <h1 className="text-2xl font-bold text-white mb-2">
              {t('platform.heroTitle')}
            </h1>
            <p className="text-white/90">{t('platform.heroDesc')}</p>
          </motion.div>
        </div>
      </section>

      {/* 🎁 10 MILLION SUBSIDY BANNER - TOP OF PAGE */}
      <section id="subsidy" className="container py-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <Card className="bg-gradient-to-br from-[#D4AF37] via-[#f0d878] to-[#D4AF37] border-0 shadow-xl overflow-hidden relative">
            <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHZpZXdCb3g9IjAgMCA0MCA0MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxjaXJjbGUgZmlsbD0iI2ZmZiIgZmlsbC1vcGFjaXR5PSIuMSIgY3g9IjIwIiBjeT0iMjAiIHI9IjMiLz48L2c+PC9zdmc+')] opacity-30"></div>
            <CardContent className="p-6 relative">
              {/* Header */}
              <div className="text-center mb-6">
                <div className="inline-flex items-center gap-2 bg-red-500 text-white text-sm font-bold px-4 py-1.5 rounded-full mb-3 animate-pulse">
                  <Sparkles className="w-4 h-4" />
                  {t('subsidy.badge')}
                </div>
                <h2 className="text-2xl font-bold text-white drop-shadow-lg mb-2">
                  {t('subsidy.title')}
                </h2>
                <p className="text-white/90 text-lg">
                  {t('subsidy.subtitle')}
                </p>
              </div>

              {/* Main Question & Answer */}
              <div className="bg-white/20 backdrop-blur-sm rounded-2xl p-5 mb-6">
                <div className="text-center">
                  <h3 className="text-xl font-bold text-white mb-2">
                    {t('subsidy.heroTitle')}
                  </h3>
                  <p className="text-2xl font-bold text-white">
                    👉 {t('subsidy.heroAnswer')}
                  </p>
                </div>
              </div>

              {/* Main Message */}
              <div className="bg-white rounded-2xl p-5 mb-6 shadow-lg">
                <p className="text-gray-800 text-center text-lg font-medium">
                  {t('subsidy.mainMessage')}
                </p>
              </div>

              {/* What is it */}
              <div className="mb-6">
                <h4 className="text-white font-bold text-lg mb-3 flex items-center gap-2">
                  <BadgePercent className="w-5 h-5" />
                  {t('subsidy.whatIs')}
                </h4>
                <p className="text-white/90 leading-relaxed">
                  {t('subsidy.whatIsDesc')}
                </p>
              </div>

              {/* Why we do this - 3 reasons */}
              <div className="mb-6">
                <h4 className="text-white font-bold text-lg mb-4 flex items-center gap-2">
                  <Heart className="w-5 h-5" />
                  {t('subsidy.whyTitle')}
                </h4>
                <div className="space-y-3">
                  <div className="bg-white/20 backdrop-blur-sm rounded-xl p-4">
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 bg-white/30 rounded-lg flex items-center justify-center shrink-0">
                        <Rocket className="w-5 h-5 text-white" />
                      </div>
                      <div>
                        <h5 className="font-bold text-white">{t('subsidy.reason1')}</h5>
                        <p className="text-white/80 text-sm">{t('subsidy.reason1Desc')}</p>
                      </div>
                    </div>
                  </div>
                  <div className="bg-white/20 backdrop-blur-sm rounded-xl p-4">
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 bg-white/30 rounded-lg flex items-center justify-center shrink-0">
                        <Heart className="w-5 h-5 text-white" />
                      </div>
                      <div>
                        <h5 className="font-bold text-white">{t('subsidy.reason2')}</h5>
                        <p className="text-white/80 text-sm">{t('subsidy.reason2Desc')}</p>
                      </div>
                    </div>
                  </div>
                  <div className="bg-white/20 backdrop-blur-sm rounded-xl p-4">
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 bg-white/30 rounded-lg flex items-center justify-center shrink-0">
                        <GraduationCap className="w-5 h-5 text-white" />
                      </div>
                      <div>
                        <h5 className="font-bold text-white">{t('subsidy.reason3')}</h5>
                        <p className="text-white/80 text-sm">{t('subsidy.reason3Desc')}</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Proof Example */}
              <div className="mb-6">
                <h4 className="text-white font-bold text-lg mb-3 flex items-center gap-2">
                  <CheckCircle className="w-5 h-5" />
                  {t('subsidy.proofTitle')}
                </h4>
                <div className="bg-white rounded-xl p-4 space-y-2">
                  <div className="flex items-center gap-2 text-gray-700">
                    <span className="text-lg">📱</span>
                    <span>{t('subsidy.proof1')}</span>
                  </div>
                  <div className="flex items-center gap-2 text-[#D4AF37] font-bold">
                    <span className="text-lg">🎁</span>
                    <span>{t('subsidy.proof2')}</span>
                  </div>
                  <div className="flex items-center gap-2 text-green-600">
                    <span className="text-lg">✅</span>
                    <span>{t('subsidy.proof3')}</span>
                  </div>
                </div>
              </div>

              {/* Not a Scam */}
              <div className="bg-green-500 rounded-xl p-4 mb-6">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 bg-white/30 rounded-lg flex items-center justify-center shrink-0">
                    <Shield className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h5 className="font-bold text-white text-lg">{t('subsidy.notScam')}</h5>
                    <p className="text-white/90 text-sm">{t('subsidy.notScamDesc')}</p>
                  </div>
                </div>
              </div>

              {/* Limited Time */}
              <div className="bg-red-500/90 rounded-xl p-4">
                <div className="flex items-center gap-3">
                  <Clock className="w-8 h-8 text-white animate-pulse" />
                  <div>
                    <h5 className="font-bold text-white text-lg">{t('subsidy.limitedTime')}</h5>
                    <p className="text-white/90 text-sm">{t('subsidy.limitedTimeDesc')}</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </section>

      {/* Main Content */}
      <div className="container py-6">
        {/* HOW IT WORKS */}
        <Section
          id="howItWorks"
          icon={<ShoppingBag className="w-6 h-6" />}
          title={t('platform.howItWorksSimple')}
          color="bg-blue-500"
        >
          <div className="space-y-4">
            {howItWorksSteps.map((step, index) => (
              <motion.div
                key={step.num}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.1 }}
              >
                <Card className="border-2 border-gray-100">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-4">
                      <div className={`w-14 h-14 ${step.color} rounded-2xl flex items-center justify-center text-white shrink-0`}>
                        {step.icon}
                      </div>
                      <div>
                        <h4 className="font-bold text-gray-900">{step.title}</h4>
                        <p className="text-gray-600 text-sm">{step.desc}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}

            {/* No Loss Guarantee */}
            <Card className="bg-gradient-to-r from-green-500 to-green-600 border-0 text-white">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center">
                    <CheckCircle className="w-6 h-6" />
                  </div>
                  <div>
                    <h4 className="font-bold text-lg">{t('platform.noLossSimple')}</h4>
                    <p className="text-white/90 text-sm">{t('platform.noLossDesc')}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Infographic */}
            <div className="mt-4">
              <img 
                src="/images/01-GroupBuy-Infographic-TJ.png" 
                alt="Group Buy Infographic" 
                className="w-full rounded-xl shadow-lg"
                loading="lazy"
              />
            </div>
          </div>
        </Section>

        {/* REFERRAL SYSTEM */}
        <Section
          id="referral"
          icon={<Users className="w-6 h-6" />}
          title={t('platform.referralSimple')}
          color="bg-[#D4AF37]"
        >
          <div className="space-y-4">
            {/* Pyramid visualization */}
            <div className="flex flex-col items-center gap-2 mb-4">
              {referralLevels.map((level, index) => (
                <motion.div
                  key={level.level}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: index * 0.1 }}
                  className={`${level.color} text-white rounded-xl py-3 px-6 text-center`}
                  style={{ width: `${100 - index * 20}%` }}
                >
                  <div className="flex items-center justify-center gap-2">
                    <span className="text-2xl font-bold">{level.percent}</span>
                    <span className="text-sm opacity-90">{level.desc}</span>
                  </div>
                </motion.div>
              ))}
            </div>

            {/* Example calculation */}
            <Card className="bg-gradient-to-r from-[#D4AF37]/10 to-transparent border-[#D4AF37]/30 border-2">
              <CardContent className="p-4">
                <h4 className="font-bold text-gray-900 mb-3 flex items-center gap-2">
                  <TrendingUp className="w-5 h-5 text-[#D4AF37]" />
                  {t('platform.referralCalc')}
                </h4>
                <p className="text-gray-600 text-sm leading-relaxed">
                  {t('platform.referralExample')}
                </p>
                <div className="mt-3 p-3 bg-[#D4AF37] rounded-lg text-center">
                  <span className="text-white font-bold text-xl">= 450 TJS / моҳ</span>
                </div>
              </CardContent>
            </Card>

            {/* Infographic */}
            <div className="mt-4">
              <img 
                src="/images/02-Referral-Infographic-TJ.png" 
                alt="Referral Infographic" 
                className="w-full rounded-xl shadow-lg"
                loading="lazy"
              />
            </div>
          </div>
        </Section>

        {/* POINTS MALL */}
        <Section
          id="pointsMall"
          icon={<Coins className="w-6 h-6" />}
          title={t('platform.pointsMallSimple')}
          color="bg-amber-500"
        >
          <div className="space-y-4">
            <Card className="bg-gradient-to-r from-amber-500 to-amber-600 border-0 text-white">
              <CardContent className="p-4 text-center">
                <Coins className="w-12 h-12 mx-auto mb-2" />
                <h4 className="font-bold text-2xl">1 Хол = 1 TJS</h4>
                <p className="text-white/90 text-sm mt-1">{t('platform.pointsMallDesc')}</p>
              </CardContent>
            </Card>

            {/* Balance vs Points explanation */}
            <div className="grid grid-cols-2 gap-3">
              <Card className="border-2 border-green-200 bg-green-50">
                <CardContent className="p-4 text-center">
                  <div className="w-10 h-10 bg-green-500 rounded-full flex items-center justify-center mx-auto mb-2">
                    <Wallet className="w-5 h-5 text-white" />
                  </div>
                  <h5 className="font-bold text-gray-900">{t('platform.balance')}</h5>
                  <p className="text-xs text-gray-600 mt-1">{t('platform.balanceDesc')}</p>
                </CardContent>
              </Card>
              <Card className="border-2 border-amber-200 bg-amber-50">
                <CardContent className="p-4 text-center">
                  <div className="w-10 h-10 bg-amber-500 rounded-full flex items-center justify-center mx-auto mb-2">
                    <Coins className="w-5 h-5 text-white" />
                  </div>
                  <h5 className="font-bold text-gray-900">{t('platform.points')}</h5>
                  <p className="text-xs text-gray-600 mt-1">{t('platform.pointsDesc')}</p>
                </CardContent>
              </Card>
            </div>

            {/* Infographic */}
            <div className="mt-4">
              <img 
                src="/images/03-PointsMall-Infographic-TJ.png" 
                alt="Points Mall Infographic" 
                className="w-full rounded-xl shadow-lg"
                loading="lazy"
              />
            </div>
          </div>
        </Section>

        {/* FUND SAFETY */}
        <Section
          id="fundSafety"
          icon={<Shield className="w-6 h-6" />}
          title={t('platform.fundSafetySimple')}
          color="bg-green-500"
        >
          <div className="space-y-4">
            {securityFeatures.map((feature, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1 }}
              >
                <Card className="border-2 border-green-100">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 bg-green-100 rounded-xl flex items-center justify-center text-green-600">
                        {feature.icon}
                      </div>
                      <div>
                        <h4 className="font-bold text-gray-900">{feature.title}</h4>
                        <p className="text-gray-600 text-sm">{feature.desc}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}

            {/* Infographic */}
            <div className="mt-4">
              <img 
                src="/images/05-FundSafety-Infographic-TJ.png" 
                alt="Fund Safety Infographic" 
                className="w-full rounded-xl shadow-lg"
                loading="lazy"
              />
            </div>
          </div>
        </Section>

        {/* SPIN WHEEL */}
        <Section
          id="spinWheel"
          icon={<Gift className="w-6 h-6" />}
          title={t('platform.spinWheel')}
          color="bg-purple-500"
        >
          <div className="space-y-4">
            <Card className="bg-gradient-to-r from-purple-500 to-pink-500 border-0 text-white">
              <CardContent className="p-4 text-center">
                <span className="text-5xl block mb-2">🎡</span>
                <h4 className="font-bold text-xl">{t('platform.spinWheel')}</h4>
                <p className="text-white/90 text-sm mt-1">{t('platform.spinWheelDesc')}</p>
              </CardContent>
            </Card>

            {/* Infographic */}
            <div className="mt-4">
              <img 
                src="/images/06-SpinWheel-Poster-TJ.png" 
                alt="Spin Wheel Poster" 
                className="w-full rounded-xl shadow-lg"
                loading="lazy"
              />
            </div>
          </div>
        </Section>

        {/* WHY TRUST */}
        <Section
          id="whyTrust"
          icon={<Star className="w-6 h-6" />}
          title={t('platform.whyTrust')}
          color="bg-[#0D7C66]"
        >
          <div className="space-y-3">
            {trustFactors.map((factor, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.1 }}
              >
                <Card className="border-2 border-[#0D7C66]/20">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 bg-[#0D7C66]/10 rounded-xl flex items-center justify-center text-[#0D7C66]">
                        {factor.icon}
                      </div>
                      <div>
                        <h4 className="font-bold text-gray-900">{factor.title}</h4>
                        <p className="text-gray-600 text-sm">{factor.desc}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}

            {/* Contact info */}
            <Card className="bg-[#0D7C66] text-white mt-4">
              <CardContent className="p-4">
                <div className="flex items-center gap-3 mb-2">
                  <Phone className="w-5 h-5" />
                  <span>+992 770000611</span>
                </div>
                <div className="flex items-center gap-3 mb-2">
                  <MapPin className="w-5 h-5" />
                  <span>{t('platform.trust2Desc')}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-lg">📱</span>
                  <span>@Tezbarakat_Malika</span>
                </div>
              </CardContent>
            </Card>
          </div>
        </Section>
      </div>
    </div>
  );
}
