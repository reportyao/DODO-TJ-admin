import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Link } from 'wouter';
import {
  CheckCircle,
  Circle,
  MessageCircle,
  Wallet,
  ShoppingBag,
  Coins,
  Users,
  ArrowRight,
  Sparkles,
} from 'lucide-react';

export default function Guide() {
  const { t } = useTranslation();
  const [completedSteps, setCompletedSteps] = useState<number[]>([]);

  const toggleStep = (step: number) => {
    if (completedSteps.includes(step)) {
      setCompletedSteps(completedSteps.filter(s => s !== step));
    } else {
      setCompletedSteps([...completedSteps, step]);
    }
  };

  const steps = [
    {
      num: 1,
      icon: <MessageCircle className="w-6 h-6" />,
      title: t('guide.step1'),
      desc: t('guide.step1Desc'),
      detail: t('guide.step1Detail'),
      color: 'bg-blue-500',
      action: {
        text: t('guide.openTelegram'),
        href: 'https://t.me/tezbarakat_bot',
      },
    },
    {
      num: 2,
      icon: <Wallet className="w-6 h-6" />,
      title: t('guide.step2'),
      desc: t('guide.step2Desc'),
      detail: t('guide.step2Detail'),
      color: 'bg-green-500',
      action: null,
    },
    {
      num: 3,
      icon: <ShoppingBag className="w-6 h-6" />,
      title: t('guide.step3'),
      desc: t('guide.step3Desc'),
      detail: t('guide.step3Detail'),
      color: 'bg-purple-500',
      action: null,
    },
    {
      num: 4,
      icon: <Coins className="w-6 h-6" />,
      title: t('guide.step4'),
      desc: t('guide.step4Desc'),
      detail: t('guide.step4Detail'),
      color: 'bg-amber-500',
      action: null,
    },
    {
      num: 5,
      icon: <Users className="w-6 h-6" />,
      title: t('guide.step5'),
      desc: t('guide.step5Desc'),
      detail: t('guide.step5Detail'),
      color: 'bg-[#0D7C66]',
      action: {
        text: t('guide.goToHome'),
        href: '/',
        internal: true,
      },
    },
  ];

  const progress = (completedSteps.length / steps.length) * 100;

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
              <span className="text-4xl">🚀</span>
            </div>
            <h1 className="text-2xl font-bold text-white mb-2">
              {t('guide.heroTitle')}
            </h1>
            <p className="text-white/90">{t('guide.heroDesc')}</p>
          </motion.div>
        </div>
      </section>

      <div className="container py-6">
        {/* Progress Bar */}
        <Card className="mb-6 border-2 border-[#0D7C66]/20">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-600">{t('guide.progress')}</span>
              <span className="text-sm font-bold text-[#0D7C66]">{completedSteps.length}/{steps.length}</span>
            </div>
            <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
              <motion.div
                className="h-full bg-gradient-to-r from-[#0D7C66] to-[#D4AF37]"
                initial={{ width: 0 }}
                animate={{ width: `${progress}%` }}
                transition={{ duration: 0.5 }}
              />
            </div>
            {completedSteps.length === steps.length && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="mt-3 text-center"
              >
                <span className="text-2xl">🎉</span>
                <p className="text-[#0D7C66] font-bold">{t('guide.completed')}</p>
              </motion.div>
            )}
          </CardContent>
        </Card>

        {/* Steps */}
        <div className="space-y-4">
          {steps.map((step, index) => (
            <motion.div
              key={step.num}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
            >
              <Card 
                className={`overflow-hidden transition-all ${
                  completedSteps.includes(step.num)
                    ? 'border-2 border-green-400 bg-green-50/50'
                    : 'border-2 border-gray-100'
                }`}
              >
                <CardContent className="p-0">
                  {/* Step Header */}
                  <div 
                    className="p-4 cursor-pointer"
                    onClick={() => toggleStep(step.num)}
                  >
                    <div className="flex items-center gap-4">
                      {/* Step Number & Icon */}
                      <div className="relative">
                        <div className={`w-14 h-14 ${step.color} rounded-2xl flex items-center justify-center text-white`}>
                          {step.icon}
                        </div>
                        <div className={`absolute -top-1 -right-1 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                          completedSteps.includes(step.num)
                            ? 'bg-green-500 text-white'
                            : 'bg-white border-2 border-gray-200 text-gray-600'
                        }`}>
                          {completedSteps.includes(step.num) ? '✓' : step.num}
                        </div>
                      </div>

                      {/* Step Content */}
                      <div className="flex-1">
                        <h3 className="font-bold text-gray-900">{step.title}</h3>
                        <p className="text-gray-600 text-sm">{step.desc}</p>
                      </div>

                      {/* Checkbox */}
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                        completedSteps.includes(step.num)
                          ? 'bg-green-500 text-white'
                          : 'bg-gray-100'
                      }`}>
                        {completedSteps.includes(step.num) ? (
                          <CheckCircle className="w-5 h-5" />
                        ) : (
                          <Circle className="w-5 h-5 text-gray-400" />
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Step Detail */}
                  <div className="px-4 pb-4">
                    <div className="bg-gray-50 rounded-xl p-4 ml-[4.5rem]">
                      <p className="text-gray-700 text-sm leading-relaxed">{step.detail}</p>
                      
                      {step.action && (
                        <div className="mt-3">
                          {step.action.internal ? (
                            <Link href={step.action.href}>
                              <Button className="w-full bg-[#0D7C66] hover:bg-[#0a6b58]">
                                {step.action.text}
                                <ArrowRight className="w-4 h-4 ml-2" />
                              </Button>
                            </Link>
                          ) : (
                            <a href={step.action.href} target="_blank" rel="noopener noreferrer">
                              <Button className="w-full bg-[#0D7C66] hover:bg-[#0a6b58]">
                                {step.action.text}
                                <ArrowRight className="w-4 h-4 ml-2" />
                              </Button>
                            </a>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>

        {/* Quick Start Infographic */}
        <section className="mt-8">
          <Card className="overflow-hidden">
            <CardContent className="p-0">
              <img 
                src="/images/04-QuickStart-Infographic-TJ.webp" 
                alt="Quick Start Guide" 
                className="w-full"
                loading="lazy"
              />
            </CardContent>
          </Card>
        </section>

        {/* CTA */}
        <section className="mt-8">
          <Card className="bg-gradient-to-r from-[#D4AF37] to-[#c9a432] border-0 text-white">
            <CardContent className="p-6 text-center">
              <Sparkles className="w-12 h-12 mx-auto mb-3" />
              <h3 className="font-bold text-xl mb-2">{t('guide.readyToStart')}</h3>
              <p className="text-white/90 text-sm mb-4">{t('guide.readyToStartDesc')}</p>
              <Link href="/">
                <Button className="bg-white text-[#D4AF37] hover:bg-white/90">
                  {t('guide.generateLink')}
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </Link>
            </CardContent>
          </Card>
        </section>
      </div>
    </div>
  );
}
