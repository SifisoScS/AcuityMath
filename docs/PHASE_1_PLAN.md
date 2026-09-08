# AcuityMath — Phase 1 Execution Plan: Security, Persistence & Compliance

**Document Version:** 1.0.0  
**Target Horizon:** Weeks 1–4 (Phase 1 of Production Roadmap)  
**Primary Objective:** Transition AcuityMath from an in-browser prototype using `localStorage` and client-only state into a secure, COPPA/FERPA-compliant full-stack application backed by durable cloud persistence and authenticated Role-Based Access Control (RBAC).

---

## 1. Executive Summary & Goals

The AcuityMath prototype has successfully validated the core learning experience, tactile manipulatives, and age-tiered navigation. However, the application currently lacks server-side data persistence, genuine user authentication, and regulatory child privacy compliance. 

### Phase 1 Core Deliverables:
1. **Durable Cloud Persistence:** Replace ephemeral browser `localStorage` with a persistent database (PostgreSQL with Drizzle ORM or Firebase Firestore).
2. **Multi-Tier Identity Management:** Implement parent/educator OAuth & JWT authentication, complemented by child-friendly login mechanisms (QR codes and picture passwords for Ages 3–6; PINs for Ages 7–14).
3. **Server-Side RBAC Enforcement:** Secure all routes and profile operations; eliminate client-side role switching and mock PIN vulnerabilities.
4. **COPPA & FERPA Compliance:** Deploy Verifiable Parental Consent (VPC) flows, data minimization, and automated student data deletion pipelines.
5. **Tamper-Proof Screen Time Engine:** Migrate screen time counters and streaks to a server-authoritative heartbeat model.
6. **Zero-Friction Client Migration:** Provide a transparent storage adapter in the frontend that hydrates from and syncs with the remote API while retaining offline fallback capability.

---

## 2. Target Architecture (Phase 1)

```
┌─────────────────────────────────────────────────────────────────────────┐
│                      Client Layer (React 19 + Vite)                     │
│  ┌─────────────────────────┐   ┌─────────────────────────────────────┐  │
│  │  Existing UI Components │   │   Unified API / Storage Adapter     │  │
│  │  (Student/Parent/Admin) │──▶│   (Swappable LocalStorage vs API)   │  │
│  └─────────────────────────┘   └──────────────────┬──────────────────┘  │
└───────────────────────────────────────────────────┼─────────────────────┘
                                                    │ HTTPS / Signed JWT
                                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                   Server API Layer (Node.js / Express)                  │
│  ┌───────────────────────┐  ┌──────────────────┐  ┌─────────────────┐   │
│  │   Auth & RBAC Guards  │  │ Session Heartbeat│  │  COPPA Consent  │   │
│  │   (Parents / Teachers)│  │ (Screen Limits)  │  │  & Audit Engine │   │
│  └───────────┬───────────┘  └────────┬─────────┘  └────────┬────────┘   │
│              └───────────────────────┼─────────────────────┘            │
└──────────────────────────────────────┼──────────────────────────────────┘
                                       ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                       Data Layer (Cloud Database)                       │
│     [ Users ] ──▶ [ Profiles/Students ] ──▶ [ Progress & Mastery ]      │
│     [ Assignments ] ──▶ [ Sessions & Screen Time ] ──▶ [ Audit Logs ]   │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Database Schema & Data Modeling

The schema enforces strict relational boundaries between legal guardians/educators and minor student profiles.

### 3.1 Entity: `users` (Guardians & Educators)
| Field | Type | Description |
| :--- | :--- | :--- |
| `id` | UUID (PK) | Unique user account identifier |
| `email` | VARCHAR(255) | Unique verified email |
| `password_hash` | VARCHAR(255) | Argon2id / bcrypt hash (or null if OAuth) |
| `oauth_provider` | VARCHAR(50) | `google`, `apple`, or `email` |
| `role` | ENUM | `'parent'`, `'teacher'`, `'district_admin'` |
| `coppa_consent_at`| TIMESTAMP | Exact timestamp when parent verified consent |
| `coppa_method` | VARCHAR(50) | Method of verification (e.g., credit card micro-auth / email plus code) |
| `created_at` | TIMESTAMP | Account creation date |

### 3.2 Entity: `students` (Child Profiles)
*Zero Personally Identifiable Information (PII) is required.*
| Field | Type | Description |
| :--- | :--- | :--- |
| `id` | UUID (PK) | Unique student profile identifier |
| `account_id` | UUID (FK) | Reference to owning `users.id` (Parent or School Admin) |
| `display_name` | VARCHAR(50) | First name or pseudonym (e.g., "Leo the Math Lion") |
| `age` | SMALLINT | Current age (3–18) |
| `age_tier` | ENUM | `'early'`, `'elementary'`, `'middle'`, `'high'` |
| `avatar_id` | VARCHAR(50) | Selected avatar identifier |
| `login_type` | ENUM | `'qr_badge'`, `'picture_sequence'`, `'pin'`, `'password'` |
| `auth_secret_hash`| VARCHAR(255)| Hashed login credential (e.g., hashed 4-digit PIN or picture sequence) |
| `dynamic_level` | NUMERIC(3,1)| Adaptive level rating (1.0 to 10.0) |
| `coins` | INTEGER | Unspent in-app reward economy balance |
| `streak_days` | INTEGER | Consecutive active learning days |
| `last_active_at` | TIMESTAMP | Last session activity timestamp |

### 3.3 Entity: `student_screen_time_rules`
| Field | Type | Description |
| :--- | :--- | :--- |
| `student_id` | UUID (PK, FK) | Reference to `students.id` |
| `daily_limit_mins`| INTEGER | Daily limit in minutes (default: 45) |
| `lockout_start` | TIME | Curfew start time (e.g., 20:00) |
| `lockout_end` | TIME | Curfew end time (e.g., 07:00) |
| `is_locked` | BOOLEAN | Instant remote parental freeze toggle |

### 3.4 Entity: `lesson_attempts` & `mastery_snapshots`
| Field | Type | Description |
| :--- | :--- | :--- |
| `id` | UUID (PK) | Unique attempt record identifier |
| `student_id` | UUID (FK) | Reference to `students.id` |
| `lesson_id` | VARCHAR(100)| Reference to curriculum lesson ID |
| `score_percent` | SMALLINT | Achieved accuracy percentage (0–100) |
| `xp_earned` | INTEGER | Experience points awarded |
| `coins_earned` | INTEGER | Rewards awarded |
| `time_spent_secs`| INTEGER | Active working time spent |
| `completed_at` | TIMESTAMP | Completion timestamp |

---

## 4. Authentication, Authorization & RBAC Matrix

### 4.1 Parent & Teacher Authentication
* **Protocol:** OAuth 2.0 (Google, Apple) with fallback to Email + Magic Link or secure password authentication.
* **Token Transport:** Signed JWTs stored in secure, `HttpOnly`, `SameSite=Strict`, TLS-only cookies (immune to XSS and client-side scraping).
* **Parental Verification Gate:** Before accessing the parent dashboard or adjusting limits, re-authenticate via short-lived biometric token or 6-digit session PIN.

### 4.2 Age-Appropriate Student Authentication
* **Early Sprouts (Ages 3–6):**
  * **QR Badge Scanner:** Parent downloads a printable QR login card from the parent dashboard. The child holds it to the camera to sign in without typing.
  * **Picture Sequence Fallback:** 3-symbol visual code (e.g., `⭐` ➔ `🚀` ➔ `🍎`).
* **Navigators & Voyagers (Ages 7–14):**
  * 4-digit student PIN or classroom roster code issued by the teacher.
* **Pioneers (Ages 15–18):**
  * Standard student password or School SSO (Google Classroom / Clever).

### 4.3 Server-Side Access Control Matrix
| Resource / Action | Public / Guest | Student | Parent | Teacher | District Admin |
| :--- | :---: | :---: | :---: | :---: | :---: |
| Browse Landing & Public Curriculum | Read | Read | Read | Read | Read |
| Execute Lesson & Earn Rewards | Denied | **Own Profile Only** | Demo Mode | Demo Mode | Demo Mode |
| View Student Performance Analytics | Denied | Own High-level | **Own Children** | **Assigned Class** | **District-Wide** |
| Adjust Screen Time Limits | Denied | Denied | **Own Children** | Denied | Denied |
| Assign Homework / Missions | Denied | Denied | Home Missions | **Class Assignments** | Curriculum Templates |
| Delete Student Account & History | Denied | Denied | **Own Children** | Denied | With Approval |

---

## 5. Child Safety & Regulatory Compliance (COPPA, FERPA, GDPR-K)

### 5.1 COPPA Verifiable Parental Consent (VPC) Flow
1. **Registration:** Parent creates an account.
2. **Child Profile Addition:** When parent adds a child under 13, the system requires VPC before enabling data collection or progress tracking.
3. **Verification Methods:**
   * *Method A:* Micro-transaction verification ($0.50 authorization charge refunded immediately).
   * *Method B:* Government ID or signed digital consent form via secure verification gateway.
   * *Method C (Schools):* FERPA school official exception — school district signs institutional terms authorizing educational use.

### 5.2 Data Minimization & Privacy Rules
* No full names, home addresses, phone numbers, or geolocations are collected for students.
* No voice recordings from the scratchpad or manipulatives are retained on servers.
* No third-party behavioral trackers, marketing analytics, or advertising pixels will be included in student-facing bundles.
* Dedicated **"Download My Child's Data"** and **"Erase All Records Immediately"** self-service endpoints in the Parent Settings modal.

---

## 6. Server-Enforced Screen Time & Session Integrity

In the current prototype, screen time is calculated by `setInterval` in the client browser and can be bypassed by editing `localStorage` or refreshing the tab.

### Production Implementation:
1. **Heartbeat Token Loop:**
   * While the student is actively engaged in a lesson or manipulative, the frontend sends a signed heartbeat every 60 seconds: `POST /api/sessions/heartbeat`.
   * Payload includes active interaction timestamps (preventing idle background tab exploitation).
2. **Server-Side Accumulator:**
   * The server increments the student's daily screen time counter in Redis or the primary database.
   * The response returns `{ remainingMinutes: 14, isLocked: false }`.
3. **Hard Lockout Trigger:**
   * Once remaining time reaches `0`, the server invalidates active lesson submission tokens.
   * The frontend transitions into an unskippable "Daily Math Goal Completed — Time to Rest!" lock screen with optional parent PIN unlock bypass.

---

## 7. Client Storage Migration Strategy

To prevent breaking existing prototype functionality, we will use a **Repository Pattern / Storage Adapter**:

```typescript
// src/services/storageAdapter.ts
export interface IStorageService {
  getProfiles(): Promise<UserProfile[]>;
  saveProfile(profile: UserProfile): Promise<void>;
  getLessons(): Promise<MathLesson[]>;
  submitLessonAttempt(attempt: LessonAttempt): Promise<AttemptResult>;
  getScreenTime(studentId: string): Promise<ScreenTimeRecord>;
}

// Seamless toggle between LocalStorage (Offline/Demo) and Cloud API
export const storageService: IStorageService = 
  process.env.VITE_USE_CLOUD_API === 'true' 
    ? new CloudApiStorageService() 
    : new LocalStorageService();
```

* **Step 1:** Abstract all direct `localStorage.getItem` / `saveItem` calls in `App.tsx` and components into `storageService`.
* **Step 2:** When a parent logs in for the first time, offer a 1-click **"Sync Local Prototype Data to Cloud Account"** button that batches current local profiles into the remote database.

---

## 8. Week-by-Week Implementation Plan (4-Week Sprint)

### Week 1: Infrastructure, Cloud Database & Data Layer
* **Milestone 1.1:** Provision Cloud Database (PostgreSQL with Drizzle ORM or Firestore).
* **Milestone 1.2:** Write database migration scripts establishing `users`, `students`, `lessons`, `attempts`, and `audit_logs`.
* **Milestone 1.3:** Setup server-side Express API structure with type-safe routing, validation (Zod), and error middleware.
* **Milestone 1.4:** Unit test all database CRUD models and relational cascading deletes.

### Week 2: Authentication, Authorization & COPPA Verification
* **Milestone 2.1:** Implement Parent/Teacher OAuth 2.0 (Google/Apple) and email verification routes.
* **Milestone 2.2:** Issue secure `HttpOnly` JWT session cookies with refresh token rotation.
* **Milestone 2.3:** Build student authentication routes: QR code token validation, 4-digit PIN verification, and picture-password hasher.
* **Milestone 2.4:** Build the COPPA Verifiable Parental Consent verification modal and database consent logger.

### Week 3: Core Business APIs & Screen Time Engine
* **Milestone 3.1:** Implement authenticated lesson submission and XP/Coin transaction endpoints with anti-replay guards.
* **Milestone 3.2:** Build the `/api/sessions/heartbeat` server-side screen time tracking engine.
* **Milestone 3.3:** Refactor frontend `src/utils/storage.ts` to implement the `StorageAdapter` connecting `App.tsx` to the new REST endpoints.
* **Milestone 3.4:** Replace mock profile switching in `ProfileSwitchModal` with real authenticated login/switch workflows.

### Week 4: Integration, Hardening & Pre-Production Deployment
* **Milestone 4.1:** End-to-end integration testing: Parent registers ➔ completes COPPA ➔ provisions child ➔ child logs in via QR ➔ completes lesson ➔ screen time enforced.
* **Milestone 4.2:** Automated test suite setup (Vitest + Playwright) for critical auth and billing/consent paths.
* **Milestone 4.3:** Security audit: Rate limiting on student PIN attempts, SQL injection / NoSQL injection tests, CORS lockdowns.
* **Milestone 4.4:** Production deployment to Cloud Run with environment variable configuration and SSL certificates.

---

## 9. Definition of Done (DoD) for Phase 1

A feature or sprint in Phase 1 is strictly considered complete only when:
1. **No Unauthenticated Access:** No student or parent profile can view analytics or modify limits without a validated session token.
2. **Zero `localStorage` Dependency for Core Records:** Clearing browser history does not wipe student progress; all records restore upon logging in.
3. **COPPA Audit Trail:** Every minor account under 13 has a timestamped parental consent record in the database.
4. **Automated Test Coverage:** >80% code coverage on all authentication, screen time, and lesson scoring routes.
5. **No Regressions in UI/UX:** All existing math manipulatives, scratchpad tools, audio effects, and age-specific curriculums function identically or better.
