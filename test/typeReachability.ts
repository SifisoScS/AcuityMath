/**
 * Which exported types nothing refers to.
 *
 * Extracted from the test that uses it so the detector itself can be tested
 * **against a source with a known orphan in it**. Inlined, it could only ever
 * assert "the list is empty" — and once the list is legitimately empty, every
 * possible weakening of the detector is silent. A guard with no positive
 * control is a claim, which is the rule this codebase applies to everything
 * else and had not yet applied to a repo invariant.
 */

/**
 * Source with its comments removed.
 *
 * **Found by mutation, and it had already bitten this very file.** Putting a
 * deleted interface back into `types.ts` went undetected, because the note
 * explaining its deletion *names it* — and that note sits inside the body of
 * the declaration above it. A type mentioned only in prose read as alive, which
 * is the one thing this detector exists to rule out.
 *
 * Prose is not a reference. A comment saying "`StandardAuditRecord` was here and
 * is gone" is evidence of exactly the opposite.
 */
function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ');
}

export interface Declaration {
  name: string;
  /** From the declaration to the next top-level `export`. */
  body: string;
}

/**
 * The exported types in a source file, each with its body.
 *
 * Split on top-level `export`, which is how `src/types.ts` is written
 * throughout. A real parser would be more robust and a dependency this does not
 * need — if the file stops being a flat list of exports, `declarations` returns
 * too few and the caller's count assertion fails rather than this quietly
 * checking nothing.
 */
export function declarations(source: string): Declaration[] {
  const pattern = /^export (?:interface|type) ([A-Za-z0-9_]+)/gm;
  // Names are read from the source as written; bodies are stripped below,
  // because only the *references* inside them are in question.

  const starts: Array<{ name: string; index: number }> = [];

  for (const match of source.matchAll(pattern)) {
    starts.push({ name: match[1], index: match.index ?? 0 });
  }

  return starts.map((start, position) => {
    const end = position + 1 < starts.length ? starts[position + 1].index : source.length;
    return { name: start.name, body: withoutComments(source.slice(start.index, end)) };
  });
}

/**
 * Types that nothing outside the file refers to, directly or transitively.
 *
 * **The closure is the part that matters.** A plain grep excluding the file
 * reports a type used only by another type as dead — which is how the first
 * sweep called `VisualType`, `MasteryDomain` and `WeeklyActivity` orphans when
 * `MathProblem` and `ParentAnalytics` name them and are used everywhere.
 * Deleting on that advice breaks the build, which is the expensive direction to
 * be wrong in.
 */
export function orphanedTypes(source: string, elsewhere: string): string[] {
  const declared = declarations(source);
  const names = declared.map(declaration => declaration.name);

  /*
   * Comments stripped here too. A doc comment in another file naming a type is
   * not a use of it — and the file most likely to name a dead type in prose is
   * the one explaining why it died.
   */
  const code = withoutComments(elsewhere);
  const reachable = new Set(
    names.filter(name => new RegExp(`\\b${name}\\b`).test(code)),
  );

  let grew = true;
  while (grew) {
    grew = false;
    for (const declaration of declared) {
      if (!reachable.has(declaration.name)) continue;
      for (const candidate of names) {
        if (reachable.has(candidate) || candidate === declaration.name) continue;
        if (new RegExp(`\\b${candidate}\\b`).test(declaration.body)) {
          reachable.add(candidate);
          grew = true;
        }
      }
    }
  }

  return names.filter(name => !reachable.has(name)).sort();
}
