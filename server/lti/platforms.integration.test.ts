// @vitest-environment node

/**
 * The platform registry, against a real MySQL.
 *
 * One property matters more than the rest: **a launch resolves only when all
 * three of issuer, client id and deployment id match.** Getting that wrong is
 * not a crash. It is one platform's launch quietly resolving as another's, with
 * a valid signature and no error anywhere, placing a child in a district that
 * never enrolled them.
 */

import { eq } from 'drizzle-orm';
import type { MySql2Database } from 'drizzle-orm/mysql2';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import * as schema from '../../drizzle/schema';
import { createTestDatabase, type TestDatabase } from '../test-support/database';
import { createInstitution } from '../learning/institutions';
import {
  addDeployment,
  AlreadyRegistered,
  listPlatforms,
  registerPlatform,
  resolveLaunch,
} from './platforms';

const DATABASE_URL = process.env.DATABASE_URL;
if (process.env.CI && !DATABASE_URL) {
  throw new Error('DATABASE_URL is unset in CI; this suite would skip while covering nothing.');
}
const describeWithDb = DATABASE_URL ? describe : describe.skip;

const CANVAS = {
  issuer: 'https://canvas.instructure.com',
  clientId: '10000000000001',
  name: 'Canvas',
  authLoginUrl: 'https://canvas.instructure.com/api/lti/authorize_redirect',
  authTokenUrl: 'https://canvas.instructure.com/login/oauth2/token',
  keysetUrl: 'https://canvas.instructure.com/api/lti/security/jwks',
};

describeWithDb('the LTI platform registry', () => {
  let harness: TestDatabase;
  let db: MySql2Database<typeof schema>;
  let lincoln: { id: number };
  let riverside: { id: number };

  beforeAll(async () => {
    harness = await createTestDatabase('ltiplatforms');
    db = harness.db;
  }, 60_000);

  afterAll(async () => {
    await harness?.close();
  });

  beforeEach(async () => {
    await harness.reset();
    lincoln = await createInstitution(db, 'Lincoln Unified');
    riverside = await createInstitution(db, 'Riverside Unified');
  });

  describe('registering', () => {
    it('accepts a platform and its deployment', async () => {
      const platform = await registerPlatform(db, CANVAS);
      const deployment = await addDeployment(db, platform.id, 'dep-1', lincoln.id);

      expect(deployment.institutionId).toBe(lincoln.id);
    });

    it('refuses the same issuer and client id twice', async () => {
      await registerPlatform(db, CANVAS);
      await expect(registerPlatform(db, CANVAS)).rejects.toThrow(AlreadyRegistered);
    });

    it('allows one issuer to register two client ids', async () => {
      /*
       * A district may install this product twice in one Canvas. The uniqueness
       * is on the pair, not on the issuer — treating the issuer as the identity
       * would make the second installation impossible.
       */
      await registerPlatform(db, CANVAS);
      await expect(
        registerPlatform(db, { ...CANVAS, clientId: '10000000000002' }),
      ).resolves.toBeTruthy();
    });

    it('allows two issuers to use the same client id', async () => {
      // Two unrelated platforms may both hand out `10001`. A client id says
      // nothing on its own.
      await registerPlatform(db, CANVAS);
      await expect(
        registerPlatform(db, {
          ...CANVAS,
          issuer: 'https://schoology.example.edu',
          name: 'Schoology',
        }),
      ).resolves.toBeTruthy();
    });

    it('refuses a URL that is not https', async () => {
      /*
       * A registration is an administrator typing values off a platform's admin
       * screen. An `http://` keyset URL means verifying launch tokens over a
       * channel anyone on the path can rewrite, and registration is the only
       * place that is cheap to catch.
       */
      await expect(
        registerPlatform(db, { ...CANVAS, keysetUrl: 'http://canvas.example.com/jwks' }),
      ).rejects.toThrow(/must be https/);
    });

    it('refuses a deployment id already used by that platform', async () => {
      const platform = await registerPlatform(db, CANVAS);
      await addDeployment(db, platform.id, 'dep-1', lincoln.id);
      await expect(addDeployment(db, platform.id, 'dep-1', riverside.id)).rejects.toThrow(
        /already registered/,
      );
    });

    it('allows two platforms to use the same deployment id', async () => {
      // `deployment_id` is unique only within its platform; both may say "1".
      const canvas = await registerPlatform(db, CANVAS);
      const schoology = await registerPlatform(db, {
        ...CANVAS,
        issuer: 'https://schoology.example.edu',
        name: 'Schoology',
      });

      await addDeployment(db, canvas.id, '1', lincoln.id);
      await expect(addDeployment(db, schoology.id, '1', riverside.id)).resolves.toBeTruthy();
    });

    it('says which parent is missing', async () => {
      const platform = await registerPlatform(db, CANVAS);
      await expect(addDeployment(db, 999_999, 'dep-1', lincoln.id)).rejects.toThrow(
        /No such platform/,
      );
      await expect(addDeployment(db, platform.id, 'dep-1', 999_999)).rejects.toThrow(
        /No such institution/,
      );
    });
  });

  describe('resolving a launch', () => {
    it('returns the platform and the district it belongs to', async () => {
      const platform = await registerPlatform(db, CANVAS);
      await addDeployment(db, platform.id, 'dep-1', lincoln.id);

      const resolved = await resolveLaunch(db, CANVAS.issuer, CANVAS.clientId, 'dep-1');
      expect(resolved?.platform.id).toBe(platform.id);
      expect(resolved?.deployment.institutionId).toBe(lincoln.id);
    });

    it('does not resolve one client id’s launch for another', async () => {
      /*
       * **The impersonation case, and the reason the lookup takes all three.**
       *
       * Two installations in one Canvas, mapped to different districts. If the
       * client id were dropped from the match, a launch from Riverside's
       * installation would resolve as Lincoln's — valid signature, no error,
       * and a child placed in a district that never enrolled them.
       */
      const first = await registerPlatform(db, CANVAS);
      const second = await registerPlatform(db, { ...CANVAS, clientId: '10000000000002' });
      await addDeployment(db, first.id, 'shared', lincoln.id);
      await addDeployment(db, second.id, 'shared', riverside.id);

      const asFirst = await resolveLaunch(db, CANVAS.issuer, CANVAS.clientId, 'shared');
      const asSecond = await resolveLaunch(db, CANVAS.issuer, '10000000000002', 'shared');

      expect(asFirst?.deployment.institutionId).toBe(lincoln.id);
      expect(asSecond?.deployment.institutionId).toBe(riverside.id);
      expect(asFirst?.deployment.id).not.toBe(asSecond?.deployment.id);
    });

    it('does not resolve one issuer’s launch for another', async () => {
      const canvas = await registerPlatform(db, CANVAS);
      const schoology = await registerPlatform(db, {
        ...CANVAS,
        issuer: 'https://schoology.example.edu',
        name: 'Schoology',
      });
      await addDeployment(db, canvas.id, '1', lincoln.id);
      await addDeployment(db, schoology.id, '1', riverside.id);

      const resolved = await resolveLaunch(db, 'https://schoology.example.edu', CANVAS.clientId, '1');
      expect(resolved?.deployment.institutionId).toBe(riverside.id);
    });

    it('returns nothing for an unregistered deployment', async () => {
      const platform = await registerPlatform(db, CANVAS);
      await addDeployment(db, platform.id, 'dep-1', lincoln.id);

      expect(await resolveLaunch(db, CANVAS.issuer, CANVAS.clientId, 'dep-2')).toBeNull();
    });

    it('returns nothing rather than throwing for a stranger', async () => {
      // A platform mid-configuration or a stale bookmark is an ordinary event;
      // the caller decides what a stranger is told.
      expect(await resolveLaunch(db, 'https://nowhere.test', 'x', 'y')).toBeNull();
    });
  });

  describe('what cannot be removed', () => {
    it('refuses to delete a district a platform still launches into', async () => {
      const platform = await registerPlatform(db, CANVAS);
      await addDeployment(db, platform.id, 'dep-1', lincoln.id);

      await expect(
        db.delete(schema.institutions).where(eq(schema.institutions.id, lincoln.id)),
      ).rejects.toThrow();
    });
  });

  describe('listing', () => {
    it('nests deployments under their platform', async () => {
      const canvas = await registerPlatform(db, CANVAS);
      await addDeployment(db, canvas.id, 'dep-1', lincoln.id);
      await addDeployment(db, canvas.id, 'dep-2', riverside.id);

      const all = await listPlatforms(db);
      expect(all).toHaveLength(1);
      expect(all[0].deployments).toHaveLength(2);
    });
  });
});
