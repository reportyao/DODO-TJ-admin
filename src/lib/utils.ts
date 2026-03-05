import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// 货币格式化
export function formatCurrency(amount: number, currency: string = 'TJS'): string {
  return `${currency} ${amount.toFixed(2)}`;
}

// 日期时间格式化（使用北京时间 UTC+8）
export function formatDateTime(dateString: string): string {
  if (!dateString) return '--';
  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return '--';
    return new Intl.DateTimeFormat('zh-CN', {
      timeZone: 'Asia/Shanghai',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    }).format(date).replace(/\//g, '-');
  } catch {
    return '--';
  }
}

// 获取彩票状态文本
export function getLotteryStatusText(status: string): string {
  const statusMap: Record<string, string> = {
    'ACTIVE': '进行中',
    'UPCOMING': '即将开始',
    'COMPLETED': '已完成',
    'SOLD_OUT': '已售完',
    'DRAWING': '开奖中',
    'CANCELLED': '已取消'
  };
  return statusMap[status] || status;
}

// 获取彩票状态颜色
export function getLotteryStatusColor(status: string): string {
  const colorMap: Record<string, string> = {
    'ACTIVE': 'bg-green-100 text-green-700',
    'UPCOMING': 'bg-blue-100 text-blue-700',
    'COMPLETED': 'bg-gray-100 text-gray-700',
    'SOLD_OUT': 'bg-red-100 text-red-700',
    'DRAWING': 'bg-purple-100 text-purple-700',
    'CANCELLED': 'bg-gray-100 text-gray-500'
  };
  return colorMap[status] || 'bg-gray-100 text-gray-700';
}

// 获取剩余时间
export function getTimeRemaining(endTime: string): {
  total: number;
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
} {
  const now = new Date().getTime();
  const end = new Date(endTime).getTime();
  const diff = Math.max(0, end - now);

  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((diff % (1000 * 60)) / 1000);

  return {
    total: diff,
    days,
    hours,
    minutes,
    seconds
  };
}

// 格式化时间剩余（用于显示）
export function formatTimeRemaining(endTime: string): string {
  const timeRemaining = getTimeRemaining(endTime);
  if (timeRemaining.total <= 0) {return '已结束';}
  
  if (timeRemaining.days > 0) {return `${timeRemaining.days}天${timeRemaining.hours}小时`;}
  if (timeRemaining.hours > 0) {return `${timeRemaining.hours}小时${timeRemaining.minutes}分钟`;}
  return `${timeRemaining.minutes}分钟`;
}

// 获取钱包类型文本
export function getWalletTypeText(type: string): string {
  // 【资金安全修复 v4】标准钱包类型: TJS=余额, LUCKY_COIN=积分
  // 保留 BALANCE 映射以兼容历史数据
  const typeMap: Record<string, string> = {
    'TJS': '余额',
    'BALANCE': '余额',  // 兼容旧数据
    'LUCKY_COIN': '积分'
  };
  return typeMap[type] || type;
}

// 复制到剪贴板
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    } else {
      // 降级方案
      const textArea = document.createElement('textarea');
      textArea.value = text;
      textArea.style.position = 'fixed';
      textArea.style.left = '-999999px';
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      try {
        document.execCommand('copy');
        textArea.remove();
        return true;
      } catch (error) {
        console.error('Failed to copy:', error);
        textArea.remove();
        return false;
      }
    }
  } catch (error) {
    console.error('Failed to copy:', error);
    return false;
  }
}

// 分享到Telegram
export function shareToTelegram(text: string, url?: string): void {
  const telegramUrl = `https://t.me/share/url?url=${encodeURIComponent(url || window.location.href)}&text=${encodeURIComponent(text)}`;
  window.open(telegramUrl, '_blank');
}
