# Phase 5 Walkthrough: Paid Courses, Dual Payment Rails & Admin Payout Approval

## Overview

Phase 5 completes the 5-phase Course Platform specification by introducing paid course support, dual payment processing (Stripe Checkout cards + Mobile Money deep-linking), admin payout approval controls, and unified webhook fulfillment.

---

## 1. Key Accomplishments

### Database Schema & Security (`supabase/migrations/20260928000003_courses_phase5_payments.sql`)
- Added `paid_approved` boolean flag to the `courses` table (default `false`).
- Created `course_orders` table to record payment transactions (rails: `'stripe'` or `'mobile_money'`, statuses: `'pending'`, `'completed'`, `'failed'`, `'refunded'`).
- Applied RLS policies:
  - Admins retain full `SELECT`, `UPDATE`, and `DELETE` permissions on `course_orders`.
  - Authenticated users can insert their own orders and select their own order history.
  - Public anonymous users have zero access.

### Pure Domain Logic (`web/lib/courses/payment.ts`)
- `formatCoursePrice(amount, currency)`: Formats numeric prices with localized separators (`EUR` vs `XOF`/`FCFA`). Sanitizes narrow non-breaking spaces for consistent cross-platform display.
- `isCoursePurchasable(course)`: Validates that a course is free OR paid with `paid_approved = true` and a positive price.

### Query & Mutation Engine (`web/lib/courses/queries.ts`, `web/lib/courses/mutations.ts`)
- `getPendingPaidCoursesForAdmin()`: Fetches paid courses awaiting admin payout approval.
- `getUserOrders()`: Retrieves complete payment order history for the current user.
- `createPendingCourseOrder()`: Initiates pending order records with unique transaction references.
- `approvePaidCourse()`: Toggles `paid_approved` state for paid courses (restricted to admins via `is_admin` RPC).

### Checkout & Webhook API Routes
- **`POST /api/courses/checkout`**:
  - Validates user authorization, course access type, and pricing.
  - Stripe Rail: Creates a Stripe Checkout Session with `course_id`, `user_id`, and `order_id` in metadata.
  - Mobile Money Rail: Generates deep-link pay URLs and creates `course_orders` entries with pending status.
- **`POST /api/courses/webhook`**:
  - Verifies Stripe signatures with `STRIPE_WEBHOOK_SECRET`.
  - On `checkout.session.completed`, marks `course_orders` as `'completed'` and writes enrollment records directly into `enrollments` table.

### UI Components & Administration Pages
- **`PaidCheckoutModal.tsx`**: Dual-tab payment selector for Stripe card checkout and Mobile Money (Wave / Orange Money / MTN MoMo).
- **`AdminPaidCourseApproval.tsx`**: Admin panel for reviewing pending paid courses, verifying instructor payout details, and toggling approval status.
- **`web/app/admin/courses/page.tsx`**: Dedicated administrative route for payout approvals.
- **Updated `EnrollButton.tsx`**: Integrates free enrollment, paid checkout modal launch, and "Achat bientôt disponible" state when awaiting admin approval.

---

## 2. Test Verification Summary

### Database & RLS Tests (`npm run test:rls`)
- **Suite**: `web/__tests__/rls/phase5-payments.test.ts`
- **Result**: All 60 RLS tests passed across 7 test files.
- **Covered Scenarios**:
  - Admins viewing pending orders and approving paid courses.
  - Users creating and viewing their own pending/completed orders.
  - Users blocked from modifying or reading other users' orders.
  - Anon users blocked from reading `course_orders`.

### Unit Tests (`npm test`)
- **Suite**: `web/__tests__/course-payment.test.ts`
- **Result**: All 79 unit tests passed across 12 test files.
- **Covered Scenarios**:
  - Price formatting (`19.99 €`, `10 000 FCFA`).
  - Purchasability checks (`free`, `paid_approved`, `paid_unapproved`).
  - Webhook payload processing and enrollment convergence logic.

---

## 3. Rules & Guidelines Checklist

- [x] **Zero Accidental Deletion**: All pre-existing routes, RPCs, and tables remain preserved.
- [x] **Feature Inventory**: Updated feature inventory documentation.
- [x] **RLS & Local Migration Protocol**: Applied locally and verified via pgTAP/Vitest prior to deployment.
- [x] **Atomic Commits**: Executed clean git commits with proper author attribution (`Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`).
- [x] **Typography**: Used French curly apostrophes (`’`, `U+2019`) throughout UI components.
