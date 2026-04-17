/**
 * 管理后台主入口
 *
 * [v2 性能优化]
 * 原实现：60+ 个页面组件全部同步 import，导致初始 JS bundle 巨大，
 * 首次加载需要下载和解析所有页面代码（即使用户只访问仪表盘）。
 *
 * 优化：
 * - 所有页面改为 React.lazy() 动态导入
 * - 仅保留 Layout 壳组件（Router, Sidebar, Header）同步加载
 * - 添加 Suspense fallback 加载指示器
 * - 首屏 JS 体积预计减少 60-70%
 *
 * [v3 Bug修复]
 * - 修复登录页面暴露侧边栏和 Header 的安全问题
 * - 登录页使用独立布局，不再包含管理后台壳
 * - 清理 requiredRole 死代码（ProtectedRoute 不支持此参数）
 * - 添加缺失的订单详情路由 /orders/:id
 */
import { BrowserRouter as Router, Routes, Route, Link, useNavigate, useLocation } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import React, { useState, Suspense } from 'react'
import ProtectedRoute from './components/ProtectedRoute'
import { AdminAuthProvider, useAdminAuth } from './contexts/AdminAuthContext';
import { AdminDebugPanel } from './components/Debug/AdminDebugPanel';

// ============================================================
// 懒加载页面组件
// ============================================================

// 登录页（高优先级，保持同步导入）
import LoginPage from './pages/LoginPage';

// 核心页面
const DashboardPage = React.lazy(() => import('./pages/DashboardPage'));

// 用户管理
const UserListPage = React.lazy(() => import('./components/User/UserListPage').then(m => ({ default: m.UserListPage })));
const UserDetailsPage = React.lazy(() => import('./components/User/UserDetailsPage').then(m => ({ default: m.UserDetailsPage })));
const UserFinancialPage = React.lazy(() => import('./components/User/UserFinancialPage'));
const UserManagementPage = React.lazy(() => import('./pages/UserManagementPage'));
const ReferralManagementPage = React.lazy(() => import('./pages/ReferralManagementPage'));

// 商品 & 活动
const InventoryProductManagementPage = React.lazy(() => import('./pages/InventoryProductManagementPage'));
const AIListingPage = React.lazy(() => import('./pages/AIListingPage'));
const LotteryListPage = React.lazy(() => import('./components/Lottery/LotteryListPage').then(m => ({ default: m.LotteryListPage })));
const LotteryDetailPage = React.lazy(() => import('./components/Lottery/LotteryDetailPage').then(m => ({ default: m.LotteryDetailPage })));
const LotteryForm = React.lazy(() => import('./components/Lottery/LotteryForm').then(m => ({ default: m.LotteryForm })));
const GroupBuyProductManagementPage = React.lazy(() => import('./pages/GroupBuyProductManagementPage'));
const GroupBuySessionManagementPage = React.lazy(() => import('./pages/GroupBuySessionManagementPage'));

// 订单 & 物流
const OrderListPage = React.lazy(() => import('./components/Order/OrderListPage').then(m => ({ default: m.OrderListPage })));
const OrderDetailPage = React.lazy(() => import('./components/Order/OrderDetailPage').then(m => ({ default: m.OrderDetailPage })));
const DepositReviewPage = React.lazy(() => import('./components/Finance/DepositReviewPage').then(m => ({ default: m.DepositReviewPage })));
const WithdrawalReviewPage = React.lazy(() => import('./components/Finance/WithdrawalReviewPage').then(m => ({ default: m.WithdrawalReviewPage })));
const ShippingManagementPage = React.lazy(() => import('./components/Order/ShippingManagementPage').then(m => ({ default: m.ShippingManagementPage })));
const ShipmentBatchManagementPage = React.lazy(() => import('./pages/ShipmentBatchManagementPage'));
const OrderShipmentPage = React.lazy(() => import('./pages/OrderShipmentPage'));
const BatchArrivalConfirmPage = React.lazy(() => import('./pages/BatchArrivalConfirmPage'));
const BatchStatisticsPage = React.lazy(() => import('./pages/BatchStatisticsPage'));

// 自提 & 核销
const PickupVerificationPage = React.lazy(() => import('./pages/PickupVerificationPage'));
const PickupPointsPage = React.lazy(() => import('./pages/PickupPointsPage'));
const PickupStatsPage = React.lazy(() => import('./pages/PickupStatsPage'));
const PendingPickupsPage = React.lazy(() => import('./pages/PendingPickupsPage'));
const PickupStaffManagementPage = React.lazy(() => import('./pages/PickupStaffManagementPage'));

// 晒单 & 转售
const ShowoffReviewPage = React.lazy(() => import('./components/Showoff/ShowoffReviewPage').then(m => ({ default: m.ShowoffReviewPage })));
const OperationalShowoffCreatePage = React.lazy(() => import('./components/Showoff/OperationalShowoffCreatePage').then(m => ({ default: m.OperationalShowoffCreatePage })));
const OperationalShowoffManagementPage = React.lazy(() => import('./components/Showoff/OperationalShowoffManagementPage').then(m => ({ default: m.OperationalShowoffManagementPage })));
const ResaleManagementPage = React.lazy(() => import('./pages/ResaleManagementPage'));

// 地推管理
const PromoterDashboardPage = React.lazy(() => import('./pages/PromoterDashboardPage'));
const PromoterManagementPage = React.lazy(() => import('./pages/PromoterManagementPage'));
const PromoterReportsPage = React.lazy(() => import('./pages/PromoterReportsPage'));
const DepositAlertsPage = React.lazy(() => import('./pages/DepositAlertsPage'));
const PromotionPointsManagementPage = React.lazy(() => import('./pages/PromotionPointsManagementPage'));
const ChannelAnalyticsPage = React.lazy(() => import('./pages/ChannelAnalyticsPage'));
const PromoterDepositManagementPage = React.lazy(() => import('./pages/PromoterDepositManagementPage'));
const PromoterSettlementPage = React.lazy(() => import('./pages/PromoterSettlementPage'));

// 首页场景化管理
const HomepageCategoryManagementPage = React.lazy(() => import('./pages/HomepageCategoryManagementPage'));
const HomepageTagManagementPage = React.lazy(() => import('./pages/HomepageTagManagementPage'));
const HomepageTopicManagementPage = React.lazy(() => import('./pages/HomepageTopicManagementPage'));
const TopicPlacementManagementPage = React.lazy(() => import('./pages/TopicPlacementManagementPage'));
const ProductTaxonomyManagementPage = React.lazy(() => import('./pages/ProductTaxonomyManagementPage'));
const LocalizationLexiconPage = React.lazy(() => import('./pages/LocalizationLexiconPage'));
const AITopicGenerationPage = React.lazy(() => import('./pages/AITopicGenerationPage'));
const BehaviorDashboardPage = React.lazy(() => import('./pages/BehaviorDashboardPage'));

// 系统配置
const PaymentConfigPage = React.lazy(() => import('./pages/PaymentConfigPage').then(m => ({ default: m.PaymentConfigPage })));
const AlgorithmConfigPage = React.lazy(() => import('./pages/AlgorithmConfigPage'));
const CommissionConfigPage = React.lazy(() => import('./pages/CommissionConfigPage'));
const CommissionRecordsPage = React.lazy(() => import('./pages/CommissionRecordsPage'));
const DrawLogsPage = React.lazy(() => import('./pages/DrawLogsPage'));
const AdminManagementPage = React.lazy(() => import('./pages/AdminManagementPage'));
const PermissionManagementPage = React.lazy(() => import('./pages/PermissionManagementPage'));
const BannerManagementPage = React.lazy(() => import('./pages/BannerManagementPage'));
const AIManagementPage = React.lazy(() => import('./pages/AIManagementPage'));
const ErrorLogsPage = React.lazy(() => import('./pages/ErrorLogsPage'));
const AuditLogsPage = React.lazy(() => import('./pages/AuditLogsPage'));

// 静态页面（保持同步导入，体积极小）
import { UnauthorizedPage } from './components/UnauthorizedPage';
import { ForbiddenPage } from './components/ForbiddenPage';

// ============================================================
// 加载指示器
// ============================================================
function PageLoadingFallback() {
  return (
    <div className="flex items-center justify-center h-64">
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 border-3 border-blue-600 border-t-transparent rounded-full animate-spin" />
        <span className="text-sm text-gray-500">加载中...</span>
      </div>
    </div>
  );
}

// ============================================================
// Header Component
// ============================================================
function AppHeader({ sidebarOpen, setSidebarOpen }: { sidebarOpen: boolean; setSidebarOpen: (open: boolean) => void }): JSX.Element {
  const { admin, logout } = useAdminAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
      <button
        onClick={() => setSidebarOpen(!sidebarOpen)}
        className="text-gray-600 hover:text-gray-900"
      >
        ☰
      </button>
      <div className="flex items-center space-x-4">
        <div className="text-gray-600">
          {admin?.display_name || admin?.username}
        </div>
        <button
          onClick={handleLogout}
          className="px-4 py-2 text-sm text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors"
        >
          退出登录
        </button>
      </div>
    </div>
  );
}

// ============================================================
// 管理后台布局（含侧边栏 + Header）
// ============================================================
function AdminLayout({ sidebarOpen, setSidebarOpen }: { sidebarOpen: boolean; setSidebarOpen: (open: boolean) => void }): JSX.Element {
  return (
    <div className="flex h-screen bg-gray-100">
      {/* Sidebar */}
      <div className={`${sidebarOpen ? 'w-64' : 'w-20'} bg-gray-900 text-white transition-all duration-300 overflow-y-auto`}>
        <div className="p-4 border-b border-gray-700">
          <h1 className="font-bold text-xl">DODO Admin</h1>
        </div>
        <nav className="mt-2 space-y-1 px-2 pb-4">
          <NavLink to="/" label="仪表盘" icon="📊" />
          <NavLink to="/users" label="用户列表" icon="👥" />
          <NavLink to="/user-management" label="用户管理" icon="👤" />
          <NavLink to="/referral-management" label="推荐管理" icon="🌳" />
          <NavLink to="/inventory-products" label="库存商品" icon="📦" />
          <NavLink to="/ai-listing" label="AI上架助手" icon="✨" />
          <NavLink to="/lotteries" label="商城活动" icon="🎰" />
          <NavLink to="/orders" label="订单管理" icon="📦" />
          <NavLink to="/deposit-review" label="充值审核" icon="💰" />
          <NavLink to="/withdrawal-review" label="提现审核" icon="💸" />

          <NavLink to="/shipping-management" label="物流管理" icon="🚚" />
          <NavLink to="/shipment-batches" label="批次管理" icon="📦" />
          <NavLink to="/order-shipment" label="订单发货" icon="🚀" />
          <NavLink to="/batch-statistics" label="批次统计" icon="📊" />
          <NavLink to="/pickup-verification" label="自提核销" icon="✅" />
          <NavLink to="/pickup-points" label="自提点管理" icon="📍" />
          <NavLink to="/pickup-stats" label="核销统计" icon="📈" />
          <NavLink to="/pending-pickups" label="待核销列表" icon="📋" />
          <NavLink to="/pickup-staff" label="核销员管理" icon="🛡️" />
          <NavLink to="/showoff-review" label="晒单审核" icon="📸" />
          <NavLink to="/showoff-create" label="创建运营晒单" icon="✨" />
          <NavLink to="/showoff-management" label="运营晒单管理" icon="📋" />
          <NavLink to="/resale-management" label="转售管理" icon="🔄" />

          {/* ==================== 地推管理模块 ==================== */}
          <NavSection label="地推管理" />
          <NavLink to="/promoter-dashboard" label="地推指挥室" icon="🎯" />
          <NavLink to="/promoter-management" label="人员管理" icon="🧑‍💼" />
          <NavLink to="/promotion-points" label="点位管理" icon="📍" />
          <NavLink to="/channel-analytics" label="渠道分析" icon="📡" />
          <NavLink to="/promoter-reports" label="KPI报表" icon="📊" />
          <NavLink to="/deposit-alerts" label="充值告警" icon="🔔" />
          <NavLink to="/promoter-deposits" label="充值对账" icon="💰" />
          <NavLink to="/promoter-settlement" label="缴款管理" icon="💳" />

          {/* ==================== 首页场景化管理 ==================== */}
          <NavSection label="首页场景化" />
          <NavLink to="/homepage-categories" label="分类管理" icon="📂" />
          <NavLink to="/homepage-tags" label="标签管理" icon="🏷️" />
          <NavLink to="/homepage-topics" label="专题管理" icon="📰" />
          <NavLink to="/topic-placements" label="投放管理" icon="📡" />
          <NavLink to="/product-taxonomy" label="商品分类标签" icon="🔖" />
          <NavLink to="/localization-lexicon" label="本地化词库" icon="🌍" />
          <NavLink to="/ai-topic-generate" label="AI专题助手" icon="🤖" />
          <NavLink to="/behavior-dashboard" label="行为看板" icon="📊" />

          {/* ==================== 系统配置 ==================== */}
          <NavSection label="系统配置" />
          <NavLink to="/payment-config" label="支付配置" icon="⚙️" />
          <NavLink to="/commission-config" label="佣金配置" icon="💵" />
          <NavLink to="/commission-records" label="佣金记录" icon="📊" />
          <NavLink to="/algorithm-config" label="算法配置" icon="🧮" />
          <NavLink to="/draw-logs" label="开奖管理" icon="🎲" />
          <NavLink to="/admin-management" label="管理员管理" icon="👨‍💼" />
          <NavLink to="/permission-management" label="权限管理" icon="🔐" />
          <NavLink to="/banner-management" label="Banner管理" icon="🖼️" />
          <NavLink to="/ai-management" label="AI管理" icon="🤖" />
          <NavLink to="/error-logs" label="错误监控" icon="⚠️" />
          <NavLink to="/audit-logs" label="审计日志" icon="📋" />
        </nav>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <AppHeader sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen} />

        {/* Content - 包裹在 Suspense 中支持懒加载 */}
        <div className="flex-1 overflow-auto p-6">
          <Suspense fallback={<PageLoadingFallback />}>
            <Routes>
              <Route path="/" element={<ProtectedRoute element={<DashboardPage />} />} />
              <Route path="/users" element={<ProtectedRoute element={<UserListPage />} />} />
              <Route path="/users/:id" element={<ProtectedRoute element={<UserDetailsPage />} />} />
              <Route path="/users/:userId/financial" element={<ProtectedRoute element={<UserFinancialPage />} />} />
              <Route path="/user-management" element={<ProtectedRoute element={<UserManagementPage />} />} />
              <Route path="/referral-management" element={<ProtectedRoute element={<ReferralManagementPage />} />} />
              <Route path="/inventory-products" element={<ProtectedRoute element={<InventoryProductManagementPage />} />} />
              <Route path="/ai-listing" element={<ProtectedRoute element={<AIListingPage />} />} />
              <Route path="/lotteries" element={<ProtectedRoute element={<LotteryListPage />} />} />
              <Route path="/lotteries/new" element={<ProtectedRoute element={<LotteryForm />} />} />
              <Route path="/lotteries/:id/detail" element={<ProtectedRoute element={<LotteryDetailPage />} />} />
              <Route path="/lotteries/:id" element={<ProtectedRoute element={<LotteryForm />} />} />
              <Route path="/group-buy-products" element={<ProtectedRoute element={<GroupBuyProductManagementPage />} />} />
              <Route path="/group-buy-sessions" element={<ProtectedRoute element={<GroupBuySessionManagementPage />} />} />
              <Route path="/orders" element={<ProtectedRoute element={<OrderListPage />} />} />
              <Route path="/orders/:id" element={<ProtectedRoute element={<OrderDetailPage />} />} />
              <Route path="/deposit-review" element={<ProtectedRoute element={<DepositReviewPage />} />} />
              <Route path="/withdrawal-review" element={<ProtectedRoute element={<WithdrawalReviewPage />} />} />
              <Route path="/shipping-management" element={<ProtectedRoute element={<ShippingManagementPage />} />} />
              <Route path="/shipment-batches" element={<ProtectedRoute element={<ShipmentBatchManagementPage />} />} />
              <Route path="/order-shipment" element={<ProtectedRoute element={<OrderShipmentPage />} />} />
              <Route path="/batch-arrival-confirm/:id" element={<ProtectedRoute element={<BatchArrivalConfirmPage />} />} />
              <Route path="/batch-statistics" element={<ProtectedRoute element={<BatchStatisticsPage />} />} />
              <Route path="/pickup-verification" element={<ProtectedRoute element={<PickupVerificationPage />} />} />
              <Route path="/pickup-points" element={<ProtectedRoute element={<PickupPointsPage />} />} />
              <Route path="/pickup-stats" element={<ProtectedRoute element={<PickupStatsPage />} />} />
              <Route path="/pending-pickups" element={<ProtectedRoute element={<PendingPickupsPage />} />} />
              <Route path="/pickup-staff" element={<ProtectedRoute element={<PickupStaffManagementPage />} />} />
              <Route path="/showoff-review" element={<ProtectedRoute element={<ShowoffReviewPage />} />} />
              <Route path="/showoff-create" element={<ProtectedRoute element={<OperationalShowoffCreatePage />} />} />
              <Route path="/showoff-management" element={<ProtectedRoute element={<OperationalShowoffManagementPage />} />} />
              <Route path="/resale-management" element={<ProtectedRoute element={<ResaleManagementPage />} />} />
              <Route path="/admin-management" element={<ProtectedRoute element={<AdminManagementPage />} />} />
              <Route path="/permission-management" element={<ProtectedRoute element={<PermissionManagementPage />} />} />
              <Route path="/payment-config" element={<ProtectedRoute element={<PaymentConfigPage />} />} />
              <Route path="/commission-config" element={<ProtectedRoute element={<CommissionConfigPage />} />} />
              <Route path="/commission-records" element={<ProtectedRoute element={<CommissionRecordsPage />} />} />
              <Route path="/algorithm-config" element={<ProtectedRoute element={<AlgorithmConfigPage />} />} />
              <Route path="/draw-logs" element={<ProtectedRoute element={<DrawLogsPage />} />} />
              <Route path="/banner-management" element={<ProtectedRoute element={<BannerManagementPage />} />} />
              <Route path="/ai-management" element={<ProtectedRoute element={<AIManagementPage />} />} />
              <Route path="/error-logs" element={<ProtectedRoute element={<ErrorLogsPage />} />} />
              <Route path="/audit-logs" element={<ProtectedRoute element={<AuditLogsPage />} />} />

              {/* ==================== 首页场景化管理路由 ==================== */}
              <Route path="/homepage-categories" element={<ProtectedRoute element={<HomepageCategoryManagementPage />} />} />
              <Route path="/homepage-tags" element={<ProtectedRoute element={<HomepageTagManagementPage />} />} />
              <Route path="/homepage-topics" element={<ProtectedRoute element={<HomepageTopicManagementPage />} />} />
              <Route path="/topic-placements" element={<ProtectedRoute element={<TopicPlacementManagementPage />} />} />
              <Route path="/product-taxonomy" element={<ProtectedRoute element={<ProductTaxonomyManagementPage />} />} />
              <Route path="/localization-lexicon" element={<ProtectedRoute element={<LocalizationLexiconPage />} />} />
              <Route path="/ai-topic-generate" element={<ProtectedRoute element={<AITopicGenerationPage />} />} />
              <Route path="/behavior-dashboard" element={<ProtectedRoute element={<BehaviorDashboardPage />} />} />

              {/* ==================== 地推管理模块路由 ==================== */}
              <Route path="/promoter-dashboard" element={<ProtectedRoute element={<PromoterDashboardPage />} />} />
              <Route path="/promoter-management" element={<ProtectedRoute element={<PromoterManagementPage />} />} />
              <Route path="/promotion-points" element={<ProtectedRoute element={<PromotionPointsManagementPage />} />} />
              <Route path="/channel-analytics" element={<ProtectedRoute element={<ChannelAnalyticsPage />} />} />
              <Route path="/promoter-reports" element={<ProtectedRoute element={<PromoterReportsPage />} />} />
              <Route path="/deposit-alerts" element={<ProtectedRoute element={<DepositAlertsPage />} />} />
              <Route path="/promoter-deposits" element={<ProtectedRoute element={<PromoterDepositManagementPage />} />} />
              <Route path="/promoter-settlement" element={<ProtectedRoute element={<PromoterSettlementPage />} />} />

              <Route path="/unauthorized" element={<UnauthorizedPage />} />
              <Route path="/forbidden" element={<ForbiddenPage />} />
            </Routes>
          </Suspense>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Main App
// [v3] 登录页使用独立布局，不再显示侧边栏和 Header
// ============================================================
function App(): JSX.Element {
  const [sidebarOpen, setSidebarOpen] = useState(true)

  return (
    <Router basename="/admin">
      <AdminAuthProvider>
      <AdminDebugPanel />
      <AppRoutes sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen} />
      <Toaster position="top-center" />
      </AdminAuthProvider>
    </Router>
  )
}

/**
 * [v3] 路由分发组件
 * 根据当前路径决定使用登录布局还是管理后台布局
 */
function AppRoutes({ sidebarOpen, setSidebarOpen }: { sidebarOpen: boolean; setSidebarOpen: (open: boolean) => void }): JSX.Element {
  const location = useLocation();

  // 登录页使用独立的全屏布局，不显示侧边栏和 Header
  if (location.pathname === '/login') {
    return (
      <Routes>
        <Route path="/login" element={<LoginPage />} />
      </Routes>
    );
  }

  // 其他页面使用管理后台布局（含侧边栏 + Header）
  return <AdminLayout sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen} />;
}

function NavLink({ to, label, icon }: { to: string; label: string; icon: string }): JSX.Element {
  return (
    <Link
      to={to}
      className="flex items-center space-x-3 px-3 py-1.5 rounded-lg hover:bg-gray-800 transition-colors text-sm"
    >
      <span className="text-xl">{icon}</span>
      <span>{label}</span>
    </Link>
  )
}

function NavSection({ label }: { label: string }): JSX.Element {
  return (
    <div className="pt-4 pb-1 px-3">
      <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider">{label}</div>
    </div>
  )
}

export default App
