/**
 * The whole URL surface of this build, in one place.
 *
 * TWO APPS, ONE BUILD:
 *
 *   `/`          — the app chooser (no provider, no request).
 *   `/local/*`   — the LOCAL app: Consignments, Pending For Planning, Pickup
 *                  Requests, Control Tower, Inbound and the column configuration page. Mounted OUTSIDE `AuthShell`, so no
 *                  auth provider ever mounts for it and it issues no `/staging`
 *                  request. Nothing it renders may import `src/auth`.
 *   `/console/*` — the staging-backed console, inside `AuthShell` (the auth
 *                  provider) and, below the login screen, inside `RequireAuth`.
 *   `/grow/*`, `/driver`, `/phone-demo` — standalone demo shells, unchanged.
 *
 * The prefix is `/console`, NOT `/staging`: the Vite dev proxy forwards
 * `/staging/*` upstream, so a document load at `/staging/...` would leave the
 * app entirely.
 *
 * Everything the app answered before the split still resolves — see
 * `routes/LegacyRedirect.tsx` — in ONE hop, and the legacy entries are declared
 * LAST so they can never shadow a live route.
 */
import { Routes, Route, Navigate } from 'react-router-dom'

import AuthShell from './routes/AuthShell'
import LegacyRedirect from './routes/LegacyRedirect'
import RequireAuth from './auth/RequireAuth'
import Layout from './components/layout/Layout'
import LocalLayout from './local/LocalLayout'

import AppChooser from './pages/AppChooser'
import Login from './pages/Login'
import Profile from './pages/Profile'
import Dashboard from './pages/Dashboard'
import ConsignmentEdit from './pages/ConsignmentEdit'
import ConsignmentAdd from './pages/ConsignmentAdd'
import ConsignmentOrder from './pages/ConsignmentOrder'
import DispatchPlanning from './pages/DispatchPlanning'
import PickupRequestList from './pages/PickupRequest'
import AddPickupRequest from './pages/PickupRequest/AddPickupRequest'
import PickupRequestDetail from './pages/PickupRequest/PickupRequestDetail'
import InboundDamage from './pages/InboundDamage'
import ComingSoon from './pages/ComingSoon'

import LocalPickup from './pages/LocalPickup'
import LocalControlTower from './pages/LocalControlTower'
import LocalTripDetail from './pages/LocalControlTower/TripDetail'
import LocalInbound from './pages/LocalInbound'
import LocalRouting from './pages/LocalRouting'
import LocalRoutingPlanDetail from './pages/LocalRouting/PlanDetail'
import LocalVehicleConfig from './pages/LocalRouting/VehicleConfig'
import LocalVehicleEditor from './pages/LocalRouting/VehicleEditor'
import LocalInboundScanner from './pages/LocalInbound/Scanner'
import LocalPendingForPlanning from './pages/LocalPFP'
import LocalColumnConfiguration from './pages/LocalPFP/TableSettings'
import LocalSettings from './pages/LocalSettings'
import LocalPickupSettings from './pages/LocalSettings/PickupSettings'
import LocalGeneralSettings from './pages/LocalSettings/GeneralSettings'
import LocalConsignmentOrderSettings from './pages/LocalSettings/ConsignmentOrderSettings'
import LocalServiceOrderMasters from './pages/LocalSettings/ServiceOrderMasters'
import LocalPfpChanges from './pages/LocalPFP/Changes'
import LocalConsignments from './pages/LocalConsignments'
import ConsoleUnavailable from './pages/ConsoleUnavailable'

import GrowLayout from './pages/GrowPortal/GrowLayout'
import PickupsPage from './pages/GrowPortal/PickupsPage'
import RequestsPage from './pages/GrowPortal/RequestsPage'
import ConsignmentsPage from './pages/GrowPortal/ConsignmentsPage'
import GrowOrdersLayout from './pages/GrowOrders/GrowOrdersLayout'
import OrdersListPage from './pages/GrowOrders/OrdersListPage'
import MerchantOrderForm from './pages/GrowOrders/MerchantOrderForm'
import LocalAddConsignment from './pages/LocalConsignments/AddConsignment'
import OrderViewPage from './pages/GrowOrders/OrderViewPage'
import CheckoutPage from './pages/GrowOrders/CheckoutPage'
import PickupRequestsPage from './pages/GrowOrders/PickupRequestsPage'
/* Batch A — Grow analytics & tools pages */
import GrowDashboardPage from './pages/GrowOrders/DashboardPage'
import GrowTrackingPage from './pages/GrowOrders/TrackingPage'
import GrowQuotePage from './pages/GrowOrders/QuotePage'
import GrowReportsPage, { GrowSubscribedReportsPage } from './pages/GrowOrders/ReportsPage'
import GrowHelpPage from './pages/GrowOrders/HelpCenterPage'
/* Batch B — Grow money & account pages */
import GrowWalletPage from './pages/GrowOrders/WalletPage'
import GrowReceiptPage from './pages/GrowOrders/ReceiptPage'
import GrowBillingPage from './pages/GrowOrders/BillingPage'
import GrowDisputesPage, { DisputeViewPage as GrowDisputeViewPage } from './pages/GrowOrders/DisputesPage'
import GrowAddressBookPage, { AddressFormPage as GrowAddressFormPage, AddressViewPage as GrowAddressViewPage } from './pages/GrowOrders/AddressBookPage'
import GrowSettingsPage from './pages/GrowOrders/SettingsPage'
import DriverApp from './pages/DriverApp'
import PhoneDemo from './pages/PhoneDemo'

import CustomSettingsLayout from './nueva/CustomSettings'
import { MastersLanding, CategoryPage, SubMasterPage } from './nueva/pages'
import SkuMasterPage from './nueva/SkuMaster'
import LiveMaster from './nueva/LiveMaster'
import MyNetworkLive from './nueva/MyNetworkLive'
import { LIVE_MASTERS } from './nueva/liveMasterConfigs'
import BaseModulesPage from './nueva/BaseModules'
import ModuleDetailPage from './nueva/ModuleDetail'
import UsersManagementPage from './nueva/UsersManagement'
import RolesPermissionsPage from './nueva/RolesPermissions'
import ModuleSettingsGroupPage, { GROUP_PAGES } from './nueva/ModuleSettingsGroup'
import DeliverySettingsPage from './nueva/DeliverySettings'
import {
  IncidentManagementPage, DataValidationPage, NumberGenerationPage, LabelTemplatePage,
  ShipCommonSettingsPage, CarrierAllocationPage, ControlTowerPage,
  IntegrationsGeneralPage, WebhooksPage,
} from './nueva/settingsPages'

export default function AppRoutes() {
  return (
    <Routes>
      {/* ---------------------------------------------------------- chooser -- */}
      <Route path="/" element={<AppChooser />} />

      {/* ------------------------------------------------------- LOCAL app -- */}
      {/* Outside AuthShell on purpose: no provider, no session probe. */}
      <Route element={<LocalLayout />}>
        <Route path="/local" element={<Navigate to="/local/pending-for-planning" replace />} />
        <Route path="/local/pending-for-planning" element={<LocalPendingForPlanning key="current" />} />
        {/* the detail is an OVERLAY over the list, as staging renders it — so the
            SAME element answers both paths and mounts the overlay when `:id` is
            present. A separate element would unmount the list behind it. */}
        {/* the pickup drawer, same element for the same reason. Two segments
            deep, so it outranks `:id` and "pickup" is never read as an order id. */}
        <Route path="/local/pending-for-planning/pickup/:prId" element={<LocalPendingForPlanning key="current" />} />
        <Route path="/local/pending-for-planning/:id" element={<LocalPendingForPlanning key="current" />} />
        {/* the STAGING replica of the same page (owner, 2026-09-23): same
            component, `variant="replica"`; `key` remounts it so filters and
            selection never carry over between the two */}
        <Route path="/local/pending-for-planning-replica" element={<LocalPendingForPlanning key="replica" variant="replica" />} />
        <Route path="/local/pending-for-planning-replica/pickup/:prId" element={<LocalPendingForPlanning key="replica" variant="replica" />} />
        <Route path="/local/pending-for-planning-replica/:id" element={<LocalPendingForPlanning key="replica" variant="replica" />} />
        {/* the detail is a drawer over the list, so the SAME element answers both */}
        <Route path="/local/consignments" element={<LocalConsignments />} />
        <Route path="/local/consignments/add" element={<LocalAddConsignment />} />
        <Route path="/local/consignments/add/vehicle" element={<LocalAddConsignment />} />
        <Route path="/local/consignments/:id" element={<LocalConsignments />} />
        {/* first-mile pickup: requests → trips (Control Tower) → handover (Inbound) */}
        <Route path="/local/pickup" element={<LocalPickup />} />
        {/* the list with a request's drawer over it (same element — the list stays mounted) */}
        <Route path="/local/pickup/view/:prId" element={<LocalPickup />} />
        {/* the request = a slide-over over the list (owner, 2026-09-25) */}
        <Route path="/local/pickup/:id" element={<LocalPickup />} />
        <Route path="/local/control-tower" element={<LocalControlTower />} />
        <Route path="/local/control-tower/trips/:id" element={<LocalTripDetail />} />
        <Route path="/local/routing" element={<LocalRouting />} />
        <Route path="/local/routing/vehicles" element={<LocalVehicleConfig />} />
        <Route path="/local/routing/vehicles/:vehicleId" element={<LocalVehicleEditor />} />
        <Route path="/local/routing/:planId" element={<LocalRoutingPlanDetail />} />
        <Route path="/local/inbound" element={<LocalInbound />} />
        <Route path="/local/inbound/scanner" element={<LocalInboundScanner />} />
        <Route path="/local/columns" element={<LocalColumnConfiguration />} />
        <Route path="/local/settings" element={<LocalSettings />} />
        <Route path="/local/settings/pickup" element={<LocalPickupSettings />} />
        <Route path="/local/settings/masters/service_order" element={<LocalServiceOrderMasters page="category" />} />
        <Route path="/local/settings/masters/service_order/:subId" element={<LocalServiceOrderMasters page="sub" />} />
        <Route path="/local/settings/general" element={<LocalGeneralSettings />} />
        <Route path="/local/settings/consignment-order" element={<LocalConsignmentOrderSettings />} />
        <Route path="/local/changes" element={<LocalPfpChanges />} />
      </Route>

      {/* ------------------------------------------ standalone demo shells -- */}
      <Route path="/phone-demo" element={<PhoneDemo />} />
      <Route path="/driver" element={<DriverApp />} />
      <Route path="/grow/orders" element={<GrowOrdersLayout />}>
        <Route index element={<OrdersListPage />} />
        <Route path="add" element={<MerchantOrderForm />} />
        <Route path="add/vehicle" element={<MerchantOrderForm />} />
        <Route path="checkout" element={<CheckoutPage />} />
        {/* before :id — "pickups" must not be read as an order id */}
        <Route path="pickups" element={<PickupRequestsPage />} />
        {/* the request = a slide-over over the list (owner, 2026-09-25) */}
        <Route path="pickups/:id" element={<PickupRequestsPage />} />
        {/* Batch A — analytics & tools pages (literals before :id) */}
        <Route path="dashboard" element={<GrowDashboardPage />} />
        <Route path="tracking" element={<GrowTrackingPage />} />
        <Route path="quote" element={<GrowQuotePage />} />
        <Route path="reports" element={<GrowReportsPage />} />
        <Route path="reports/subscriptions" element={<GrowSubscribedReportsPage />} />
        <Route path="help" element={<GrowHelpPage />} />
        {/* Batch B — money & account pages (literals before :id) */}
        <Route path="wallet" element={<GrowWalletPage />} />
        <Route path="wallet/:id" element={<GrowReceiptPage />} />
        <Route path="billing" element={<GrowBillingPage />} />
        <Route path="disputes" element={<GrowDisputesPage />} />
        <Route path="disputes/:id" element={<GrowDisputeViewPage />} />
        <Route path="address-book" element={<GrowAddressBookPage />} />
        <Route path="address-book/add" element={<GrowAddressFormPage />} />
        <Route path="address-book/:id" element={<GrowAddressViewPage />} />
        <Route path="address-book/:id/edit" element={<GrowAddressFormPage />} />
        <Route path="settings" element={<GrowSettingsPage />} />
        <Route path=":id" element={<OrderViewPage />} />
      </Route>
      <Route path="/grow" element={<GrowLayout />}>
        <Route index element={<Navigate to="/grow/pickups" replace />} />
        <Route path="pickups" element={<PickupsPage />} />
        <Route path="requests" element={<RequestsPage />} />
        <Route path="consignments" element={<ConsignmentsPage />} />
        <Route path="*" element={<Navigate to="/grow/pickups" replace />} />
      </Route>

      {/* --------------------------------------------------------- CONSOLE --
          In a PRODUCTION build the whole subtree is replaced by a single
          notice: the console reads through the `/staging` dev proxy, which a
          deployment does not have. The group is REPLACED rather than shadowed
          by an added `/console/*` splat, because React Router ranks specific
          paths above a splat and the real pages would still win. */}
      {import.meta.env.PROD ? (
        <Route path="/console/*" element={<ConsoleUnavailable />} />
      ) : (
      <Route element={<AuthShell />}>
        <Route path="/console/login" element={<Login />} />

        <Route element={<RequireAuth><Layout /></RequireAuth>}>
          <Route path="/console" element={<Dashboard />} />
          <Route path="/console/profile" element={<Profile />} />
          <Route path="/console/order-management/consignment-order" element={<ConsignmentOrder />} />
          <Route path="/console/order-management/consignment-order/add" element={<ConsignmentAdd />} />
          <Route path="/console/order-management/consignment-order/:id/edit" element={<ConsignmentEdit />} />
          <Route path="/console/order-management/dispatch-planning" element={<DispatchPlanning />} />
          <Route path="/console/order-management/inbound-damage" element={<InboundDamage />} />

          <Route path="/console/order-management/pickup-request" element={<PickupRequestList />} />
          <Route path="/console/order-management/pickup-request/add" element={<AddPickupRequest />} />
          <Route path="/console/order-management/pickup-request/:id" element={<PickupRequestDetail />} />

          {/* FarEye Nueva — Custom Settings → Masters (replica of staging.fareye.co) */}
          <Route path="/console/settings" element={<CustomSettingsLayout />}>
            <Route index element={<Navigate to="/console/settings/masters" replace />} />
            <Route path="base-modules" element={<BaseModulesPage />} />
            <Route path="base-modules/:code" element={<ModuleDetailPage />} />
            <Route path="users" element={<UsersManagementPage />} />
            <Route path="roles" element={<RolesPermissionsPage />} />
            <Route path="incidents" element={<IncidentManagementPage />} />
            <Route path="carrier-allocation" element={<CarrierAllocationPage />} />
            <Route path="data-validation" element={<DataValidationPage />} />
            <Route path="number-generation" element={<NumberGenerationPage />} />
            <Route path="label-template" element={<LabelTemplatePage />} />
            <Route path="ship-common" element={<ShipCommonSettingsPage />} />
            <Route path="control-tower" element={<ControlTowerPage />} />
            <Route path="delivery-settings" element={<DeliverySettingsPage />} />
            <Route path="general-settings" element={<IntegrationsGeneralPage />} />
            <Route path="webhooks" element={<WebhooksPage />} />
            {Object.entries(GROUP_PAGES).map(([slug, g]) => (
              <Route key={slug} path={slug}
                element={<ModuleSettingsGroupPage title={g.title} subtitle={g.subtitle} modules={g.modules} />} />
            ))}
            <Route path="masters" element={<MastersLanding />} />
            <Route path="masters/:catId" element={<CategoryPage />} />
            {/* live masters intercept their routes ahead of the generic sample-data page */}
            <Route path="masters/service_order/sku" element={<SkuMasterPage />} />
            <Route path="masters/network_location/my-network-new" element={<MyNetworkLive />} />
            {Object.entries(LIVE_MASTERS).map(([subId, cfg]) => (
              <Route key={subId} path={`${cfg.catPath.replace('/console/settings/', '')}/${subId}`}
                element={<LiveMaster cfg={cfg} />} />
            ))}
            <Route path="masters/:catId/:subId" element={<SubMasterPage />} />
          </Route>

          {/* Console sidebar entries without a page yet land here. */}
          <Route path="/console/*" element={<ComingSoon />} />
        </Route>
      </Route>
      )}

      {/* ------------------------------------------------ legacy redirects -- */}
      {/* Declared LAST, and exact paths before the splats — `pending-planning`
          is a prefix of `pending-planning-local` and the two land in different
          apps. Outside AuthShell: a redirect must not mount the provider. */}
      <Route path="/login" element={<LegacyRedirect />} />
      <Route path="/profile" element={<LegacyRedirect />} />
      <Route path="/order-management/pending-planning" element={<LegacyRedirect />} />
      <Route path="/order-management/pending-planning-local" element={<LegacyRedirect />} />
      <Route path="/order-management/pending-planning-local/columns" element={<LegacyRedirect />} />
      <Route path="/order-management/pending-planning-local/*" element={<LegacyRedirect />} />
      <Route path="/order-management/*" element={<LegacyRedirect />} />
      <Route path="/settings" element={<LegacyRedirect />} />
      <Route path="/settings/*" element={<LegacyRedirect />} />

      {/* anything else — back to the chooser rather than a blank screen */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
