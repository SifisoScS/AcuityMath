/**
 * The two rights the institutional agreement grants, made reachable.
 *
 * E2 built the export and E3 built deletion. Neither had a surface, so a
 * district could exercise neither — the same gap C4d closed for the roster sync,
 * and the same reason it mattered: a capability nobody can reach is a promise
 * nobody can keep.
 *
 * Both sit behind step-up, so this component has to handle an administrator who
 * has never set a PIN. That path existed on the server from the start and had
 * never been shown to anybody: `elevate` answers `PRECONDITION_FAILED` when no
 * PIN is set, which is a different next step from a wrong one, and telling
 * somebody the wrong one wastes their time.
 */

import { useState, type CSSProperties } from 'react';

import { trpc } from '../../lib/trpc';

type Pupil = {
  id: number;
  displayName: string;
  birthYear: number;
  archivedAt: string | Date | null;
};

export function PupilRecords({ institutionId }: { institutionId: number }) {
  const pupils = trpc.institutions.pupils.useQuery({ institutionId });
  const utils = trpc.useUtils();

  const [needsElevation, setNeedsElevation] = useState(false);
  const [confirming, setConfirming] = useState<Pupil | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const refresh = () => {
    void pupils.refetch();
    void utils?.institutions.overview.invalidate();
  };

  /**
   * A refusal that means "prove you are the adult" rather than "you may not".
   *
   * `STEP_UP_REQUIRED` is the message `elevatedLearnerProcedure` throws, and
   * showing it raw would put an implementation detail in front of somebody who
   * needs a PIN box.
   */
  const handle = (error: { message: string; data?: { code?: string } | null }) => {
    if (error.message === 'STEP_UP_REQUIRED') {
      setNeedsElevation(true);
      setProblem(null);
      return;
    }
    setProblem(error.message);
  };

  if (needsElevation) {
    return (
      <ElevationPrompt
        onDone={() => {
          setNeedsElevation(false);
          setProblem(null);
        }}
      />
    );
  }

  return (
    <section style={section} aria-labelledby="records">
      <h2 id="records" style={h2}>
        Pupil records
      </h2>
      <p style={note}>
        Your agreement with AcuityMath lets you ask for a pupil's records at any time,
        or have them removed. Removal takes their practice history away rather than
        hiding it, and cannot be undone.
      </p>

      <div style={{ display: 'flex', gap: '0.5rem', margin: '0 0 1rem' }}>
        <DistrictCsvButton institutionId={institutionId} onProblem={handle} />
      </div>
      <p style={note}>
        The spreadsheet is a summary — one row per pupil, with the share of their
        year group they have covered. It holds no answers, sessions or messages;
        those are in a single child&rsquo;s export.
      </p>

      {problem ? (
        <p role="alert" style={alert}>
          {problem}
        </p>
      ) : null}
      {done ? (
        <p role="status" style={{ ...note, color: '#166534' }}>
          {done}
        </p>
      ) : null}

      {pupils.data?.length === 0 ? (
        <p style={note}>No pupils yet.</p>
      ) : null}

      {pupils.data?.map(pupil => (
        <div key={pupil.id} style={row}>
          <div>
            <strong>{pupil.displayName}</strong>
            <div style={note}>
              Born {pupil.birthYear}
              {pupil.archivedAt ? ' · records hidden from surfaces, not removed' : ''}
            </div>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <ExportButton pupil={pupil} onProblem={handle} />
            <button
              type="button"
              style={{ ...button, color: '#b91c1c' }}
              onClick={() => {
                setDone(null);
                setConfirming(pupil);
              }}
            >
              Remove records
            </button>
          </div>
        </div>
      ))}

      {confirming ? (
        <ConfirmRemoval
          pupil={confirming}
          onCancel={() => setConfirming(null)}
          onProblem={handle}
          onDone={name => {
            setConfirming(null);
            setDone(`${name}'s records have been removed.`);
            refresh();
          }}
        />
      ) : null}
    </section>
  );
}

/**
 * Hands the browser a file it already has.
 *
 * Shared by the per-child export and the district CSV rather than written
 * twice. The two differ in what they contain and in nothing else — same Blob,
 * same anchor, same revoke — and a second copy is how one of them quietly stops
 * revoking its object URL.
 */
function download(contents: string, filename: string, type: string) {
  const blob = new Blob([contents], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

/**
 * Every pupil in the district, as a spreadsheet.
 *
 * Sits beside the per-child export deliberately, sharing its step-up state: an
 * administrator who has proved they are there can do both, and one who has not
 * gets one PIN box rather than two identical ones a click apart.
 *
 * The **filename comes from the server**, which is not fussiness. It carries the
 * district's slug, and the client does not have one — inventing something close
 * enough here is how a file ends up named for the wrong district in a folder of
 * twenty.
 */
function DistrictCsvButton({
  institutionId,
  onProblem,
}: {
  institutionId: number;
  onProblem: (error: { message: string }) => void;
}) {
  const [busy, setBusy] = useState(false);
  const utils = trpc.useUtils();

  const fetchCsv = async () => {
    setBusy(true);
    try {
      const { csv, filename } = await utils.institutions.pupilCsv.fetch({ institutionId });
      download(csv, filename, 'text/csv;charset=utf-8');
    } catch (error) {
      onProblem(error as { message: string });
    } finally {
      setBusy(false);
    }
  };

  return (
    <button type="button" style={button} onClick={fetchCsv} disabled={busy}>
      {busy ? 'Preparing…' : 'Download all pupils (CSV)'}
    </button>
  );
}

function ExportButton({
  pupil,
  onProblem,
}: {
  pupil: Pupil;
  onProblem: (error: { message: string }) => void;
}) {
  const [busy, setBusy] = useState(false);
  const utils = trpc.useUtils();

  const exportRecords = async () => {
    setBusy(true);
    try {
      const dump = await utils.learners.export.fetch({ learnerId: pupil.id });

      /*
       * Built in the browser from what the server returned, rather than served
       * as a file. There is no endpoint to protect, nothing lands on disk on the
       * server, and the data never exists anywhere it was not already allowed to
       * be.
       */
      /*
       * Named by id and date, not by the child. The contents identify them
       * completely, but a filename sits in somebody's Downloads folder, shows up
       * in a file picker during a screen share, and is read by people who were
       * never meant to open it.
       */
      download(
        JSON.stringify(dump, null, 2),
        `acuitymath-learner-${pupil.id}-${new Date().toISOString().slice(0, 10)}.json`,
        'application/json',
      );
    } catch (error) {
      onProblem(error as { message: string });
    } finally {
      setBusy(false);
    }
  };

  return (
    <button type="button" style={button} onClick={exportRecords} disabled={busy}>
      {busy ? 'Preparing…' : 'Export records'}
    </button>
  );
}

function ConfirmRemoval({
  pupil,
  onCancel,
  onDone,
  onProblem,
}: {
  pupil: Pupil;
  onCancel: () => void;
  onDone: (name: string) => void;
  onProblem: (error: { message: string }) => void;
}) {
  const [typed, setTyped] = useState('');
  const remove = trpc.learners.delete.useMutation();

  /*
   * Typing the child's name, not an "are you sure".
   *
   * A confirmation dialogue is dismissed by the same reflex that opened it.
   * Reproducing the name is the smallest thing that cannot be done by accident,
   * and it makes the person say out loud which child they mean — which is the
   * mistake that actually happens in a list of thirty.
   */
  const matches = typed.trim() === pupil.displayName;

  return (
    <div role="dialog" aria-label="Remove records" style={dialog}>
      <p style={{ margin: '0 0 0.5rem' }}>
        This removes everything AcuityMath has recorded about{' '}
        <strong>{pupil.displayName}</strong> — every answer, every session, every
        message about them. It cannot be undone, and it is not the same as hiding
        them.
      </p>
      <label style={{ display: 'block', margin: '1rem 0 0.25rem' }}>
        Type <strong>{pupil.displayName}</strong> to confirm
        <input
          value={typed}
          onChange={event => setTyped(event.target.value)}
          style={{ display: 'block', width: '100%', padding: '0.4rem', marginTop: '0.25rem' }}
        />
      </label>
      <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
        <button type="button" style={button} onClick={onCancel}>
          Cancel
        </button>
        <button
          type="button"
          style={{ ...button, color: '#b91c1c' }}
          disabled={!matches || remove.isPending}
          onClick={() =>
            remove.mutate(
              { learnerId: pupil.id },
              {
                onSuccess: () => onDone(pupil.displayName),
                onError: error => onProblem(error),
              },
            )
          }
        >
          {remove.isPending ? 'Removing…' : 'Remove permanently'}
        </button>
      </div>
    </div>
  );
}

/**
 * Asks for the PIN, or says there is not one yet.
 *
 * Two different answers with two different next steps, which the server already
 * distinguished and nothing had ever shown: a wrong PIN is retyped, an unset one
 * is chosen. Telling somebody the wrong one wastes their time.
 */
function ElevationPrompt({ onDone }: { onDone: () => void }) {
  const [pin, setPin] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const [mustSet, setMustSet] = useState(false);

  const elevate = trpc.access.elevate.useMutation();
  const setPinMutation = trpc.access.setPin.useMutation();

  const submit = () => {
    setProblem(null);
    const onError = (error: { message: string; data?: { code?: string } | null }) => {
      if (error.message.includes('No PIN has been set')) {
        setMustSet(true);
        setProblem(null);
        return;
      }
      setProblem(error.message);
    };

    if (mustSet) {
      setPinMutation.mutate(
        { pin },
        { onSuccess: () => elevate.mutate({ pin }, { onSuccess: onDone, onError }), onError },
      );
      return;
    }
    elevate.mutate({ pin }, { onSuccess: onDone, onError });
  };

  return (
    <section style={section} aria-labelledby="stepup">
      <h2 id="stepup" style={h2}>
        {mustSet ? 'Choose a PIN' : 'Enter your PIN'}
      </h2>
      <p style={note}>
        {mustSet
          ? 'You have not set one yet. It is asked for before anybody can read or remove a child’s records.'
          : 'Reading or removing a child’s records asks for it, even though you are signed in.'}
      </p>
      {problem ? (
        <p role="alert" style={alert}>
          {problem}
        </p>
      ) : null}
      <input
        type="password"
        inputMode="numeric"
        value={pin}
        onChange={event => setPin(event.target.value)}
        aria-label={mustSet ? 'New PIN' : 'PIN'}
        style={{ padding: '0.4rem', width: '10rem' }}
      />
      <button type="button" style={{ ...button, marginLeft: '0.5rem' }} onClick={submit}>
        {mustSet ? 'Save and continue' : 'Continue'}
      </button>
    </section>
  );
}

const h2: CSSProperties = { fontSize: '1rem', margin: '0 0 0.5rem', color: '#374151' };
const note: CSSProperties = { margin: '0.25rem 0 0.75rem', fontSize: '0.875rem', color: '#6b7280' };
const alert: CSSProperties = { margin: '0 0 0.75rem', color: '#b91c1c', maxWidth: '44rem' };
const section: CSSProperties = {
  margin: '0 0 2rem',
  paddingBottom: '1.5rem',
  borderBottom: '1px solid #e5e7eb',
};
const row: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  gap: '1rem',
  padding: '0.75rem 0',
  borderTop: '1px solid #f3f4f6',
};
const button: CSSProperties = {
  padding: '0.4rem 0.8rem',
  fontSize: '0.9rem',
  cursor: 'pointer',
  whiteSpace: 'nowrap',
};
const dialog: CSSProperties = {
  marginTop: '1rem',
  padding: '1rem',
  border: '1px solid #fecaca',
  background: '#fef2f2',
  maxWidth: '40rem',
};
