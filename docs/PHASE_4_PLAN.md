# AcuityMath — Phase 4 Execution Plan: Enterprise LMS Integration, LTI 1.3 Advantage & District Command Center

**Document Version:** 1.0.0  
**Status:** LOCKED & ACTIVE  
**Target Horizon:** Phase 4 of Multi-Tier Architecture Roadmap  
**Primary Objective:** Transition AcuityMath into an enterprise-grade institutional mathematics platform. Deliver an LTI 1.3 Advantage interoperability engine, automated Google Classroom and Clever OneRoster synchronization, a Multi-School District Administration Command Center, state standards compliance auditing (CCSS/TEKS), and two-way automated grade passback.

---

## 1. Executive Summary & Enterprise Architecture

As school districts scale digital mathematics instruction across multiple campuses, single-classroom tools cause roster fragmentation and lack institutional oversight.

### Phase 4 Core Deliverables:

1. **LTI 1.3 Advantage & Enterprise LMS Connectors**:
   - Standard LTI 1.3 Core launch protocol.
   - Assignment and Grade Services (AGS v2.0): two-way grade passback transmitting scores, proficiency percentages, and timestamps directly into LMS gradebooks (Canvas, Google Classroom, Schoology).
   - Names and Role Provisioning Services (NRPS v2.0): Automated roster synchronization.
   - Direct integration connectors for Google Classroom, Clever OneRoster, Canvas, and Schoology.

2. **District Administrator & Multi-School Command Center (`DistrictAdminDashboard.tsx`)**:
   - Executive visibility across all campuses in the district (Lincoln Elementary, Horizon Middle, Roosevelt High, Oakridge STEM).
   - Real-time district KPIs: Total active enrollment, daily active students, mean district IRT latent ability, and curriculum pacing velocity.
   - Cross-School Comparative Benchmark and Longitudinal Cohort Growth Analytics.

3. **Curriculum Standards Compliance Auditor (CCSS & TEKS)**:
   - Automated mapping of AcuityMath lessons to Common Core State Standards (CCSS.MATH) and TEKS.
   - Domain coverage breakdown (Counting & Cardinality, Operations & Algebraic Thinking, Base Ten, Fractions, Expressions & Equations, Geometry, Calculus).
   - Deficiency alerts highlighting under-practiced areas before standardized testing windows.

4. **Automated District Assignment Dispatch & Bulk Management**:
   - District-wide diagnostic challenges and benchmark assessment scheduling with one-click deployment.

5. **FERPA & COPPA Enterprise Audit & Export Center**:
   - Export compliance reports in structured JSON, CSV, and printable executive summaries.
   - Tamper-evident activity logs for roster imports, grade synchronizations, and consent records.

---

## 2. Technical Architecture & Endpoints

```
[ District Clients & LMS ] ──▶ [ /api/district/* & /api/lms/* ] ──▶ [ Institutional Data Store ]
  • Multi-School Analytics       • GET /api/district/overview        • Multi-School Cohorts
  • LTI 1.3 AGS Grade Passback   • POST /api/lms/sync-roster         • Standards Mapping
  • Google Classroom Sync        • POST /api/lms/dispatch-assignment • Audit Records
```
