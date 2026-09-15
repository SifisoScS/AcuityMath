/**
 * What a teacher sees when their LMS asks them to choose content.
 *
 * Rendered **instead of the family app**, not inside it. A teacher doing this is
 * in a frame on their own course page, mid-task, and the shell built for a
 * parent at home — avatars, a child switcher, screen-time controls — would be
 * noise at best and confusing at worst. `main.tsx` branches on the path before
 * either is mounted.
 *
 * The last step belongs to the browser. The specification requires the response
 * to reach the platform as a POST **from the teacher's own session**, so this
 * component receives a signed token from the server and submits it itself —
 * there is no server-to-server call that could do it.
 */

import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';

import { trpc } from '../../lib/trpc';

/**
 * A teacher may choose nothing in particular, and that is a real answer.
 *
 * "Whatever they need next" is what the product does by default — the adaptive
 * engine picks. Forcing a concept would make every link narrower than the
 * product actually is, and a teacher who wants general practice would have to
 * pick something arbitrary and misleading.
 */
const ADAPTIVE = '__adaptive__';

export function ContentPicker() {
  const pending = trpc.lti.pendingChoice.useQuery();
  const concepts = trpc.curriculum.concepts.useQuery();
  const returnChoice = trpc.lti.returnChoice.useMutation();

  const [selected, setSelected] = useState<string>(ADAPTIVE);
  const [problem, setProblem] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement | null>(null);

  const chosenConcept = useMemo(
    () => concepts.data?.find(concept => concept.id === selected) ?? null,
    [concepts.data, selected],
  );

  /*
   * Submitted from an effect rather than inline, so the form exists in the
   * document before it is told to go. Calling `submit()` on a form React has
   * not yet rendered does nothing at all, silently — the teacher would be left
   * on a page that said it was sending and never did.
   */
  useEffect(() => {
    if (returnChoice.data && formRef.current) formRef.current.submit();
  }, [returnChoice.data]);

  if (pending.isLoading) return <Frame>Loading…</Frame>;

  if (!pending.data) {
    /*
     * No pending request. Either they arrived here directly, or the hour they
     * had has run out. Both are fixed the same way and the sentence says so —
     * "start again from your LMS" is something a teacher can act on, unlike
     * "no pending request".
     */
    return (
      <Frame>
        <h1 style={heading}>Nothing to choose just now</h1>
        <p style={body}>
          This page is opened by your LMS when you add AcuityMath to a course. If you
          have been here a while, the request may have expired — start again from
          your course and it will bring you back.
        </p>
      </Frame>
    );
  }

  if (returnChoice.data) {
    /*
     * A self-submitting form, and a button beside it. The effect above fires it
     * immediately; the button is for anyone the script does not reach, and for
     * the case where the submission fails and would otherwise leave somebody
     * staring at a page that said "sending" for ever.
     */
    return (
      <Frame>
        <h1 style={heading}>Adding it to your course…</h1>
        <form ref={formRef} method="post" action={returnChoice.data.returnUrl}>
          <input type="hidden" name="JWT" value={returnChoice.data.jwt} />
          <button type="submit" style={button}>
            Continue
          </button>
        </form>
      </Frame>
    );
  }

  const requestId = pending.data.requestId;

  const send = () => {
    setProblem(null);
    returnChoice.mutate(
      {
        requestId,
        chosen: [
          selected === ADAPTIVE
            ? { title: 'AcuityMath' }
            : { title: chosenConcept?.title ?? 'AcuityMath', conceptId: selected },
        ],
      },
      {
        /*
         * Shown rather than swallowed. Every refusal from the server names
         * something the teacher or their administrator can do, and the
         * alternative is a button that does nothing when pressed.
         */
        onError: error => setProblem(error.message),
      },
    );
  };

  return (
    <Frame>
      <h1 style={heading}>What should this link open?</h1>
      <p style={body}>
        Pupils who follow it will be signed in automatically and start work. You can
        add more than one link to a course if you want different topics.
      </p>

      <label style={{ display: 'block', margin: '1.5rem 0 0.5rem', fontWeight: 600 }}>
        Topic
        <select
          value={selected}
          onChange={event => setSelected(event.target.value)}
          style={select}
        >
          <option value={ADAPTIVE}>Whatever each pupil needs next (recommended)</option>
          {concepts.data?.map(concept => (
            <option key={concept.id} value={concept.id}>
              {concept.title}
            </option>
          ))}
        </select>
      </label>

      <p style={{ ...body, fontSize: '0.9rem', color: '#6b7280' }}>
        Left as it is, AcuityMath chooses each question from what that pupil has
        already mastered. Pick a topic only if this link is for one.
      </p>

      {problem ? (
        <p role="alert" style={{ ...body, color: '#b91c1c' }}>
          {problem}
        </p>
      ) : null}

      <button type="button" onClick={send} disabled={returnChoice.isPending} style={button}>
        {returnChoice.isPending ? 'Adding…' : 'Add to my course'}
      </button>
    </Frame>
  );
}

const heading: CSSProperties = { fontSize: '1.25rem', margin: '0 0 0.75rem' };
const body: CSSProperties = { margin: '0 0 0.5rem', maxWidth: '40rem' };
const select: CSSProperties = {
  display: 'block',
  width: '100%',
  maxWidth: '32rem',
  padding: '0.5rem',
  marginTop: '0.35rem',
  fontSize: '1rem',
};
const button: CSSProperties = {
  marginTop: '1.5rem',
  padding: '0.6rem 1.1rem',
  fontSize: '1rem',
  cursor: 'pointer',
};

/** Deliberately plain. This renders inside somebody else's page. */
function Frame({ children }: { children: ReactNode }) {
  return (
    <main
      style={{
        font: '16px/1.5 system-ui, sans-serif',
        color: '#1f2937',
        padding: '2.5rem',
      }}
    >
      {children}
    </main>
  );
}
