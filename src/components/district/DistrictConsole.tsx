/**
 * What a district administrator sees.
 *
 * This replaces `DistrictAdminDashboard.tsx`, which was 1,356 lines of invented
 * data: four campuses that do not exist, their principals by name, their mean
 * ability and ELO, and a "99.4% LMS sync health" figure computed from nothing.
 * It was never routed, which is the only reason it never told anybody those
 * things — but a surface that would mislead the moment somebody linked to it is
 * not meaningfully safer than one that already does.
 *
 * **The rule here is that every number shown is one the product can answer.** An
 * empty district shows zeroes, which is true and useful. A plausible figure that
 * is not measured is worse than a blank, because a blank prompts a question and
 * a plausible figure ends one.
 *
 * What is deliberately absent, and why: mean ability and ELO per campus (the
 * product computes these per learner, and aggregating them across a school is a
 * statistical claim nobody has made), standards coverage (no mapping from this
 * curriculum to a standards framework exists yet), and intervention counts
 * (nothing flags interventions). Each was in the old dashboard as a number.
 */

import type { CSSProperties, ReactNode } from 'react';

import { trpc } from '../../lib/trpc';
import { PupilRecords } from './PupilRecords';

export function DistrictConsole({ institutionId }: { institutionId: number }) {
  const overview = trpc.institutions.overview.useQuery({ institutionId });
  const courses = trpc.lti.courses.useQuery({ institutionId });
  const syncRoster = trpc.lti.syncRoster.useMutation({
    onSuccess: () => {
      void courses.refetch();
      void overview.refetch();
    },
  });

  if (overview.isLoading) return <Frame>Loading…</Frame>;

  if (overview.error) {
    /*
     * Shown rather than replaced with an empty console. "No such institution"
     * is what another district's administrator gets, and a blank page would
     * leave them wondering whether their district had been deleted.
     */
    return (
      <Frame>
        <h1 style={h1}>This district is not available to you</h1>
        <p style={p}>{overview.error.message}</p>
      </Frame>
    );
  }

  const district = overview.data;
  if (!district) return <Frame>Loading…</Frame>;

  return (
    <Frame>
      <h1 style={h1}>{district.name}</h1>

      <section style={section} aria-labelledby="agreement">
        <h2 id="agreement" style={h2}>
          Agreement
        </h2>
        {district.agreement.inForce ? (
          <p style={p}>
            In force — signed by {district.agreement.signatoryName},{' '}
            {district.agreement.signatoryTitle}, on{' '}
            {new Date(district.agreement.signedAt).toLocaleDateString()}.
            {district.agreement.expiresAt
              ? ` Runs until ${new Date(district.agreement.expiresAt).toLocaleDateString()}.`
              : ''}
          </p>
        ) : (
          /*
           * Said first and said plainly, because it gates everything else: with
           * no agreement in force this district's pupils cannot practise and no
           * roster can be synchronised. An administrator seeing empty numbers
           * below deserves to know this is why.
           */
          <p role="alert" style={{ ...p, color: '#b91c1c' }}>
            <strong>No agreement is in force.</strong> Until an administrator of this
            institution accepts the terms, its pupils cannot be signed in from an LMS
            and no roster can be synchronised.
            {district.agreement.everSigned
              ? ' A previous agreement has expired or was withdrawn.'
              : ''}
          </p>
        )}
      </section>

      <section style={section} aria-labelledby="people">
        <h2 id="people" style={h2}>
          People
        </h2>
        <dl style={grid}>
          <Figure label="Pupils" value={district.pupils} />
          <Figure label="Teachers" value={district.staff.teachers} />
          <Figure label="Administrators" value={district.staff.administrators} />
        </dl>
        <p style={note}>
          Pupils this district provisioned itself. Children of staff who signed up as
          families are theirs, not the district's, and are not counted here.
        </p>
      </section>

      <section style={section} aria-labelledby="campuses">
        <h2 id="campuses" style={h2}>
          Campuses
        </h2>
        {district.campuses.length === 0 ? (
          <p style={note}>None recorded.</p>
        ) : (
          <ul style={{ margin: 0, paddingLeft: '1.2rem' }}>
            {district.campuses.map(campus => (
              <li key={campus.id}>{campus.name}</li>
            ))}
          </ul>
        )}
      </section>

      <PupilRecords institutionId={institutionId} />

      <section style={section} aria-labelledby="courses">
        <h2 id="courses" style={h2}>
          Courses from your LMS
        </h2>

        {courses.isLoading ? <p style={note}>Loading…</p> : null}

        {courses.data && courses.data.length === 0 ? (
          <p style={note}>
            None yet. A course appears here once somebody has opened AcuityMath from
            it.
          </p>
        ) : null}

        {courses.data?.map(course => (
          <div key={course.id} style={row}>
            <div>
              <strong>{course.title ?? course.contextId}</strong>
              <div style={note}>
                {course.lastSyncedAt
                  ? `Last synchronised ${new Date(course.lastSyncedAt).toLocaleString()}`
                  : 'Never synchronised'}
              </div>
              {/*
                * The two things that stop a sync, and the two things only an
                * administrator can fix. Said here rather than left to surface as
                * a failure when they press the button.
                */}
              {!course.canSync ? (
                <div style={warn}>
                  No roster endpoint. Enable the Names and Roles scope for this tool
                  in your LMS.
                </div>
              ) : null}
              {!course.knowsYearGroup ? (
                <div style={warn}>
                  No year group. Add a <code>grade_level</code> custom parameter to the
                  placement, or pupils cannot be created from it.
                </div>
              ) : null}
            </div>
            <button
              type="button"
              style={button}
              disabled={!course.canSync || syncRoster.isPending}
              onClick={() => syncRoster.mutate({ contextId: course.id })}
            >
              {syncRoster.isPending ? 'Synchronising…' : 'Synchronise'}
            </button>
          </div>
        ))}

        {syncRoster.error ? (
          /*
           * Passed through rather than flattened. Every refusal from the server
           * names something this person can go and do.
           */
          <p role="alert" style={{ ...p, color: '#b91c1c' }}>
            {syncRoster.error.message}
          </p>
        ) : null}

        {syncRoster.data ? (
          <p role="status" style={p}>
            Synchronised: {syncRoster.data.created} pupils created,{' '}
            {syncRoster.data.enrolled} enrolled, {syncRoster.data.unenrolled} removed
            from the class.
            {syncRoster.data.skipped > 0
              ? ` ${syncRoster.data.skipped} skipped.`
              : ''}
            {syncRoster.data.unknownStaff > 0
              ? ` ${syncRoster.data.unknownStaff} staff on the roster have not opened AcuityMath yet.`
              : ''}
          </p>
        ) : null}
      </section>
    </Frame>
  );
}

function Figure({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <dt style={note}>{label}</dt>
      <dd style={{ margin: 0, fontSize: '1.5rem', fontWeight: 600 }}>{value}</dd>
    </div>
  );
}

const h1: CSSProperties = { fontSize: '1.5rem', margin: '0 0 1.5rem' };
const h2: CSSProperties = { fontSize: '1rem', margin: '0 0 0.5rem', color: '#374151' };
const p: CSSProperties = { margin: '0 0 0.5rem', maxWidth: '44rem' };
const note: CSSProperties = { margin: '0.25rem 0 0', fontSize: '0.875rem', color: '#6b7280' };
const warn: CSSProperties = { margin: '0.25rem 0 0', fontSize: '0.875rem', color: '#b45309' };
const section: CSSProperties = {
  margin: '0 0 2rem',
  paddingBottom: '1.5rem',
  borderBottom: '1px solid #e5e7eb',
};
const grid: CSSProperties = { display: 'flex', gap: '2.5rem', margin: 0 };
const row: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'flex-start',
  gap: '1rem',
  padding: '0.75rem 0',
  borderTop: '1px solid #f3f4f6',
};
const button: CSSProperties = {
  padding: '0.45rem 0.9rem',
  fontSize: '0.95rem',
  cursor: 'pointer',
  whiteSpace: 'nowrap',
};

function Frame({ children }: { children: ReactNode }) {
  return (
    <main style={{ font: '16px/1.5 system-ui, sans-serif', color: '#1f2937', padding: '2.5rem' }}>
      {children}
    </main>
  );
}
