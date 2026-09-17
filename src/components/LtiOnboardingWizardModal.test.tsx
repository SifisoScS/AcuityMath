/**
 * The setup screen, held to what the server actually serves.
 *
 * This component had no test at all, which is how it kept three wrong endpoint
 * URLs, a fabricated `sec_live_…` secret, an LTI 1.1 cartridge under a 1.3
 * heading, a handshake button that was a `setTimeout`, and a rules-of-hooks
 * violation that crashes the moment somebody opens it. Every one of those is
 * asserted against here.
 */

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { LtiOnboardingWizardModal } from './LtiOnboardingWizardModal';

const configQuery = vi.fn();
const refetch = vi.fn();

vi.mock('../lib/trpc', () => ({
  trpc: {
    lti: { toolConfiguration: { useQuery: () => configQuery() } },
  },
}));

vi.mock('../utils/audio', () => ({
  playClickSound: vi.fn(),
  playSuccessSound: vi.fn(),
}));

/** The shape the server's `toolConfiguration` returns, as this screen reads it. */
type Config = {
  endpoints: { loginUrl: string; launchUrl: string; jwksUrl: string };
  baseUrlConfigured: boolean;
  oneRosterAvailable: boolean;
  checks: Array<{ id: string; label: string; state: 'pass' | 'fail'; detail: string }>;
};

const served: Config = {
  endpoints: {
    loginUrl: 'https://acuitymath.org/api/lti/login',
    launchUrl: 'https://acuitymath.org/api/lti/launch',
    jwksUrl: 'https://acuitymath.org/api/lti/jwks.json',
  },
  baseUrlConfigured: true,
  oneRosterAvailable: false,
  checks: [
    {
      id: 'signing_key',
      label: 'Signing key published',
      state: 'pass',
      detail: '1 key at the keyset URL.',
    },
  ],
};

function ready(data: Config = served) {
  configQuery.mockReturnValue({
    data,
    isLoading: false,
    isFetching: false,
    error: null,
    refetch,
  });
}

describe('connecting a learning management system', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    ready();
  });

  describe('the addresses an administrator is given', () => {
    it('are the routes the server actually mounts', async () => {
      /*
       * **The assertion this file exists for.** The previous version advertised
       * `/api/lti/login_init` and `/api/lti/deep_link`, neither of which is a
       * route. A platform configured from that screen fails at its first
       * launch, and the error appears on the LMS's page rather than ours.
       */
      render(<LtiOnboardingWizardModal isOpen onClose={vi.fn()} />);

      expect(screen.getByText('https://acuitymath.org/api/lti/login')).toBeInTheDocument();
      expect(screen.getByText('https://acuitymath.org/api/lti/launch')).toBeInTheDocument();
      expect(screen.getByText('https://acuitymath.org/api/lti/jwks.json')).toBeInTheDocument();

      expect(document.body.textContent).not.toContain('login_init');
      expect(document.body.textContent).not.toContain('deep_link');
    });

    it('says deep linking arrives at the launch URL', async () => {
      // Because an administrator who goes looking for a separate deep-link
      // address will otherwise invent one, and it will 404 the first time a
      // teacher tries to embed something.
      render(<LtiOnboardingWizardModal isOpen onClose={vi.fn()} />);
      expect(screen.getByText(/deep linking arrives here too/i)).toBeInTheDocument();
    });

    it('shows no credential that belongs to nobody', async () => {
      /*
       * `sec_live_948f29d71c88e9a2` was printed as a live secret, beside a
       * client id and `dep_district_lincoln_2026`. None of the three existed.
       * The client id and deployment id are issued *by the platform* during
       * registration — this tool cannot know them before it is registered.
       */
      render(<LtiOnboardingWizardModal isOpen onClose={vi.fn()} />);

      /*
       * Every tab, not just the one that opens first. Found by mutation: a
       * secret planted on the *guides* tab was invisible to a version of this
       * test that only read the default panel, which made the test a statement
       * about `activeTab` rather than about the modal.
       */
      for (const tab of [/endpoints/i, /how to register/i, /oneroster/i, /check this instance/i]) {
        await userEvent.click(screen.getByRole('tab', { name: tab }));
        const text = document.body.textContent ?? '';
        expect(text, String(tab)).not.toMatch(/sec_live_/);
        expect(text, String(tab)).not.toMatch(/dep_district_/);
        expect(text, String(tab)).not.toMatch(/109200000000/);
      }
    });

    it('warns when the server has no public address, rather than passing off the browser’s', async () => {
      ready({ ...served, baseUrlConfigured: false, endpoints: {
        loginUrl: '/api/lti/login',
        launchUrl: '/api/lti/launch',
        jwksUrl: '/api/lti/jwks.json',
      } });

      render(<LtiOnboardingWizardModal isOpen onClose={vi.fn()} />);

      expect(screen.getByText(/no public address configured/i)).toBeInTheDocument();
      // Filled from where the reader is standing, which is a fact — and said.
      expect(screen.getByText(`${window.location.origin}/api/lti/launch`)).toBeInTheDocument();
    });
  });

  describe('checking the instance', () => {
    it('renders a failure as a failure', async () => {
      /*
       * The button this replaced was a 1,200ms `setTimeout` that reported
       * "HTTP 200 OK · RSA-256 JWT Signed · AGS v2.0 Passback Active" with no
       * network call in the function. A check that cannot fail is not a check.
       */
      ready({
        ...served,
        checks: [
          {
            id: 'https',
            label: 'Served over https',
            state: 'fail',
            detail: 'This address is not https.',
          },
        ],
      });

      render(<LtiOnboardingWizardModal isOpen onClose={vi.fn()} />);
      await userEvent.click(screen.getByRole('tab', { name: /check this instance/i }));

      expect(screen.getByText(/this address is not https/i)).toBeInTheDocument();
      expect(document.body.textContent).not.toMatch(/200 OK|Passback Active|Handshake Successful/);

      /*
       * **The state has to be readable, not merely coloured.** An earlier
       * version of this assertion checked only that the label appeared, so
       * replacing the cross with an unconditional tick changed nothing it could
       * see — which is also what a screen reader would have found.
       */
      expect(screen.getByText(/^Failed:/)).toBeInTheDocument();
      expect(screen.queryByText(/^Passed:/)).toBeNull();
    });

    it('states that it cannot prove the platform can reach us', async () => {
      // The one thing no local read can establish. Printed beside the results
      // so a row of ticks cannot imply it.
      render(<LtiOnboardingWizardModal isOpen onClose={vi.fn()} />);
      await userEvent.click(screen.getByRole('tab', { name: /check this instance/i }));

      expect(screen.getByText(/cannot tell\s+you whether your platform can reach it/i)).toBeInTheDocument();
    });
  });

  describe('OneRoster', () => {
    it('offers no address while nothing serves one', async () => {
      // Track D. The tab used to print a base URL, a consumer key and a secret
      // for an API that does not exist.
      render(<LtiOnboardingWizardModal isOpen onClose={vi.fn()} />);
      await userEvent.click(screen.getByRole('tab', { name: /oneroster/i }));

      expect(screen.getByText(/oneroster is not available yet/i)).toBeInTheDocument();
      expect(document.body.textContent).not.toContain('/api/oneroster');
    });
  });

  describe('the downloadable configuration', () => {
    it('is LTI 1.3 JSON carrying the real launch URL', async () => {
      /*
       * What replaced it matters as much as what went: the old XML was
       * `imslticc_v1p0`, an **LTI 1.1** cartridge no 1.3 platform reads, under
       * a heading that said 1.3.
       */
      const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
      let written = '';
      vi.stubGlobal('Blob', class {
        constructor(parts: string[]) {
          written = parts.join('');
        }
      });
      vi.stubGlobal('URL', { ...URL, createObjectURL: () => 'blob:x', revokeObjectURL: () => {} });

      render(<LtiOnboardingWizardModal isOpen onClose={vi.fn()} />);
      await userEvent.click(screen.getByRole('button', { name: /download lti 1.3 configuration/i }));

      await waitFor(() => expect(click).toHaveBeenCalled());
      const parsed = JSON.parse(written);
      expect(parsed.target_link_uri).toBe('https://acuitymath.org/api/lti/launch');
      expect(parsed.oidc_initiation_url).toBe('https://acuitymath.org/api/lti/login');
      expect(parsed.public_jwk_url).toBe('https://acuitymath.org/api/lti/jwks.json');
      // The deep-linking placement points at the launch URL, not a second one.
      expect(parsed.extensions[0].settings.placements[1].target_link_uri).toBe(
        'https://acuitymath.org/api/lti/launch',
      );
      expect(parsed.custom_fields).toBeUndefined();
      expect(written).not.toContain('imslticc');

      click.mockRestore();
      vi.unstubAllGlobals();
    });
  });

  describe('opening it', () => {
    it('does not crash when it goes from closed to open', async () => {
      /*
       * **A real crash, not a hypothetical.** `if (!isOpen) return null` sat
       * above four `useState` calls, so the closed render ran one hook and the
       * open render ran five — "Rendered more hooks than during the previous
       * render", which React throws rather than warns about.
       *
       * `TeacherDashboard` mounts this permanently and toggles `isOpen`, so the
       * path was the only path. Nothing caught it because nothing had ever
       * rendered this component.
       */
      const { rerender } = render(<LtiOnboardingWizardModal isOpen={false} onClose={vi.fn()} />);
      expect(screen.queryByRole('dialog')).toBeNull();

      rerender(<LtiOnboardingWizardModal isOpen onClose={vi.fn()} />);
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    it('closes', async () => {
      const onClose = vi.fn();
      render(<LtiOnboardingWizardModal isOpen onClose={onClose} />);
      await userEvent.click(screen.getByRole('button', { name: /^done$/i }));
      expect(onClose).toHaveBeenCalled();
    });
  });
});
