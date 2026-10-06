import {
  type FormEvent,
  lazy,
  useCallback,
  useEffect,
  useState,
} from "react";
import {
  AuthApiError,
  authApi,
  type AuthOrganization,
  type AuthUser,
} from "./auth-api";
import { AuthChallenge } from "./AuthChallenge";
import { DeferredSection } from "./DeferredSection";
const AdminConsole = lazy(() => import("./AdminConsole").then(module => ({ default: module.AdminConsole })));
import { adminApi } from "./admin-api";
const AuthoringWorkspace = lazy(() => import("./AuthoringWorkspace").then(module => ({ default: module.AuthoringWorkspace })));
import {
  OnboardingApiError,
  onboardingApi,
  type CatalogueMode,
  type OnboardingState,
  type SlugAvailability,
} from "./onboarding-api";

type AuthMode = "login" | "register";

type AuthenticatedState = {
  user: AuthUser;
  organizations: AuthOrganization[];
  platformAdmin: boolean;
};

type FormState = {
  displayName: string;
  organizationName: string;
  email: string;
  password: string;
  confirmPassword: string;
};

const EMPTY_FORM: FormState = {
  displayName: "",
  organizationName: "",
  email: "",
  password: "",
  confirmPassword: "",
};

function messageForError(
  error: unknown,
): string {
  if (
    error instanceof AuthApiError
    || error instanceof OnboardingApiError
  ) {
    return error.message;
  }

  return "Something went wrong. Please try again.";
}

// Techabanca master brand.
// This mirrors the company-site geometry and wordmark.
// Product UI work must not redesign or replace this mark.
function Brand({
  variant = "light",
}: {
  variant?: "light" | "dark";
}) {
  return (
    <a
      href="https://techabanca.com"
      target="_blank"
      rel="noreferrer"
      aria-label="Techabanca website"
      className={`catalogue-brand ${
        variant === "dark"
          ? "catalogue-brand--dark"
          : "catalogue-brand--light"
      }`}
    >
      <span
        className="catalogue-brand-icon"
        aria-hidden="true"
      >
        <span />
        <span />
        <span />
      </span>

      <span className="catalogue-brand-copy">
        <span className="catalogue-brand-wordmark">
          TECHABANCA
          <span className="catalogue-brand-period">
            .
          </span>
        </span>
        <span className="catalogue-brand-product">
          CATALOGUE
        </span>
      </span>
    </a>
  );
}

function EyeIcon({
  open,
}: {
  open: boolean;
}) {
  return open ? (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="size-5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
    >
      <path d="M3 12s3.5-6 9-6 9 6 9 6-3.5 6-9 6-9-6-9-6Z" />
      <circle cx="12" cy="12" r="2.5" />
    </svg>
  ) : (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="size-5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
    >
      <path d="m4 4 16 16" />
      <path d="M10.7 6.1A9.8 9.8 0 0 1 12 6c5.5 0 9 6 9 6a14.6 14.6 0 0 1-2.2 3" />
      <path d="M14.2 14.2A3 3 0 0 1 9.8 9.8" />
      <path d="M6.2 6.2C4.2 7.7 3 10 3 12c0 0 3.5 6 9 6 1 0 2-.2 2.9-.5" />
    </svg>
  );
}

function CheckIcon({
  className = "size-4",
}: {
  className?: string;
}) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 20 20"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m5 10 3 3 7-7" />
    </svg>
  );
}

function LoadingIndicator({
  label,
}: {
  label: string;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex flex-col items-center text-center"
    >
      <div className="relative size-12">
        <div className="absolute inset-0 animate-spin rounded-full border-2 border-[#dfe6e2] border-r-[#8fbe4f] border-t-[#0b1519] motion-reduce:animate-none" />
        <div className="absolute inset-[6px] rounded-full bg-white shadow-sm" />
        <div className="absolute inset-0 grid place-items-center text-xs font-black text-[#0b1519]">
          T
        </div>
      </div>
      <div className="mt-4 text-sm font-semibold text-[#4f5d58]">
        {label}
      </div>
      <div className="mt-2 h-1 w-24 overflow-hidden rounded-full bg-[#e9eeeb]">
        <div className="h-full w-1/2 animate-pulse rounded-full bg-[#9bcf55]" />
      </div>
    </div>
  );
}

function TextInput({
  id,
  label,
  type = "text",
  value,
  placeholder,
  autoComplete,
  onChange,
  required = true,
}: {
  id: string;
  label: string;
  type?: string;
  value: string;
  placeholder: string;
  autoComplete?: string;
  onChange: (value: string) => void;
  required?: boolean;
}) {
  return (
    <label
      htmlFor={id}
      className="block"
    >
      <span className="mb-2 block text-sm font-semibold text-[#182227]">
        {label}
      </span>
      <input
        id={id}
        name={id}
        type={type}
        value={value}
        placeholder={placeholder}
        autoComplete={autoComplete}
        required={required}
        onChange={(event) =>
          onChange(event.target.value)
        }
        className="h-12 w-full rounded-xl border border-[#dce4e0] bg-white px-4 text-[15px] text-[#081014] outline-none transition placeholder:text-[#98a3a8] focus:border-[#769f39] focus:ring-4 focus:ring-[#BAF16D]/20"
      />
    </label>
  );
}

function PasswordInput({
  id,
  label,
  value,
  placeholder,
  autoComplete,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  placeholder: string;
  autoComplete: string;
  onChange: (value: string) => void;
}) {
  const [visible, setVisible] =
    useState(false);

  return (
    <label
      htmlFor={id}
      className="block"
    >
      <span className="mb-2 block text-sm font-semibold text-[#182227]">
        {label}
      </span>
      <div className="relative">
        <input
          id={id}
          name={id}
          type={
            visible
              ? "text"
              : "password"
          }
          value={value}
          placeholder={placeholder}
          autoComplete={autoComplete}
          required
          onChange={(event) =>
            onChange(event.target.value)
          }
          className="h-12 w-full rounded-xl border border-[#dce4e0] bg-white px-4 pr-12 text-[15px] text-[#081014] outline-none transition placeholder:text-[#98a3a8] focus:border-[#769f39] focus:ring-4 focus:ring-[#BAF16D]/20"
        />
        <button
          type="button"
          aria-label={
            visible
              ? "Hide password"
              : "Show password"
          }
          onClick={() =>
            setVisible((current) => !current)
          }
          className="absolute inset-y-0 right-0 grid w-12 place-items-center text-[#69767c] transition hover:text-[#081014] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#769f39]"
        >
          <EyeIcon open={visible} />
        </button>
      </div>
    </label>
  );
}

function AuthScreen({
  onAuthenticated,
}: {
  onAuthenticated: () => Promise<void>;
}) {
  const [mode, setMode] =
    useState<AuthMode>("login");
  const [form, setForm] =
    useState<FormState>(EMPTY_FORM);
  const [busy, setBusy] = useState(false);
  const [error, setError] =
    useState<string | null>(null);

  const [security, setSecurity] = useState<{ enabled: boolean; siteKey: string | null } | null>(null);
  const [securityFailed, setSecurityFailed] = useState(false);
  const [challengeToken, setChallengeToken] = useState<string | null>(null);
  const [challengeGeneration, setChallengeGeneration] = useState(0);
  const challengeError = useCallback((message: string) => setError(message), []);
  const loadSecurity = useCallback(async () => {
    setSecurityFailed(false);
    setSecurity(null);
    try { setSecurity(await authApi.security()); setError(null); }
    catch { setSecurityFailed(true); setError("Sign in is temporarily unavailable. Please retry."); }
  }, []);
  useEffect(() => { void loadSecurity(); }, [loadSecurity]);

  function patch(
    key: keyof FormState,
    value: string,
  ) {
    setForm((current) => ({
      ...current,
      [key]: value,
    }));
  }

  function switchMode(
    nextMode: AuthMode,
  ) {
    setMode(nextMode);
    setChallengeToken(null);
    setError(securityFailed ? "Sign in is temporarily unavailable. Please retry." : null);
    setForm(EMPTY_FORM);
  }

  async function submit(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();
    setError(null);
    if (!security || (security.enabled && !challengeToken)) {
      setError("Complete the security check before continuing.");
      return;
    }

    if (
      mode === "register"
      && form.password
        !== form.confirmPassword
    ) {
      setError(
        "The passwords do not match.",
      );
      return;
    }

    if (
      mode === "register"
      && form.password.length < 12
    ) {
      setError(
        "Use at least 12 characters for your password.",
      );
      return;
    }

    setBusy(true);

    try {
      if (mode === "login") {
        await authApi.login({
          email: form.email,
          password: form.password,
          ...(challengeToken ? { turnstileToken: challengeToken } : {}),
        });
      } else {
        await authApi.register({
          email: form.email,
          password: form.password,
          displayName:
            form.displayName,
          organizationName:
            form.organizationName,
          ...(challengeToken ? { turnstileToken: challengeToken } : {}),
        });
      }

      await onAuthenticated();
    } catch (requestError) {
      setError(
        messageForError(requestError),
      );
    } finally {
      setBusy(false);
      setChallengeToken(null);
      setChallengeGeneration(current => current + 1);
    }
  }

  return (
    <main className="min-h-screen bg-[#f2f6f3] text-[#081014] [&_a[href]]:cursor-pointer [&_button:not(:disabled)]:cursor-pointer [&_select:not(:disabled)]:cursor-pointer">
      <div className="mx-auto grid min-h-screen w-full max-w-[1440px] grid-cols-1 lg:grid-cols-[1.02fr_0.98fr]">
        <section className="relative overflow-hidden bg-[#0b1519] px-6 py-8 text-white sm:px-10 lg:flex lg:min-h-screen lg:flex-col lg:justify-between lg:px-14 lg:py-12">
          <div
            aria-hidden="true"
            className="absolute -left-24 top-1/2 size-80 -translate-y-1/2 rounded-full bg-[#BAF16D]/10 blur-3xl"
          />
          <div
            aria-hidden="true"
            className="absolute -right-24 -top-24 size-72 rounded-full border border-[#BAF16D]/20"
          />

          <div className="relative">
            <Brand variant="dark" />
          </div>

          <div className="relative mt-16 max-w-xl lg:my-auto">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-[#BAF16D]">
              <span className="size-1.5 rounded-full bg-[#BAF16D]" />
              Built for serious business catalogues
            </div>
            <h1 className="text-4xl font-semibold leading-[1.06] tracking-[-0.035em] sm:text-5xl lg:text-6xl">
              Put your business
              <span className="block text-[#BAF16D]">
                in its best light.
              </span>
            </h1>
            <p className="mt-6 max-w-lg text-base leading-7 text-white/62 sm:text-lg">
              Build a clean, shareable catalogue for your products
              and services, manage enquiries, and keep your business
              presence ready for customers.
            </p>

            <div className="mt-9 grid gap-3 sm:grid-cols-3">
              {[
                ["01", "Publish with confidence"],
                ["02", "Share from anywhere"],
                ["03", "Manage in one place"],
              ].map(([number, label]) => (
                <div
                  key={number}
                  className="rounded-2xl border border-white/10 bg-white/[0.035] p-4"
                >
                  <div className="text-xs font-black tracking-[0.16em] text-[#BAF16D]">
                    {number}
                  </div>
                  <div className="mt-2 text-sm font-semibold leading-5 text-white/85">
                    {label}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <p className="relative mt-12 text-xs leading-5 text-white/38">
            Thoughtful technology for businesses moving forward.
          </p>
        </section>

        <section className="flex items-center justify-center px-5 py-10 sm:px-8 lg:px-12">
          <div className="w-full min-w-0 max-w-[520px]">
            <div className="mb-8 lg:hidden">
              <Brand />
            </div>

            <div className="rounded-2xl border border-black/[0.07] bg-white p-5 shadow-[0_24px_80px_rgba(8,16,20,0.08)] sm:p-8">
              <div className="rounded-2xl bg-[#eef3f0] p-1">
                <div className="grid grid-cols-2 gap-1">
                  <button
                    type="button"
                    onClick={() =>
                      switchMode("login")
                    }
                    className={`h-10 rounded-xl text-sm font-semibold transition ${
                      mode === "login"
                        ? "bg-white text-[#081014] shadow-sm"
                        : "text-[#68757b] hover:text-[#081014]"
                    }`}
                  >
                    Sign in
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      switchMode("register")
                    }
                    className={`h-10 rounded-xl text-sm font-semibold transition ${
                      mode === "register"
                        ? "bg-white text-[#081014] shadow-sm"
                        : "text-[#68757b] hover:text-[#081014]"
                    }`}
                  >
                    Create account
                  </button>
                </div>
              </div>

              <div className="mt-8">
                <p className="text-xs font-black tracking-[0.16em] text-[#789c45]">
                  {mode === "login"
                    ? "WELCOME BACK"
                    : "GET STARTED"}
                </p>
                <h2 className="mt-2 text-3xl font-semibold tracking-[-0.025em] text-[#081014]">
                  {mode === "login"
                    ? "Sign in to your workspace"
                    : "Create your catalogue workspace"}
                </h2>
                <p className="mt-3 text-sm leading-6 text-[#68757b]">
                  {mode === "login"
                    ? "Continue managing your business catalogue and customer enquiries."
                    : "Start with your account and business name. Catalogue setup comes next."}
                </p>
              </div>

              <form
                className="mt-7 space-y-5"
                onSubmit={submit}
              >
                {mode === "register" && (
                  <>
                    <TextInput
                      id="displayName"
                      label="Your name"
                      value={form.displayName}
                      placeholder="Akash Nishant"
                      autoComplete="name"
                      onChange={(value) =>
                        patch("displayName", value)
                      }
                    />
                    <TextInput
                      id="organizationName"
                      label="Business name"
                      value={form.organizationName}
                      placeholder="Example Industries"
                      autoComplete="organization"
                      onChange={(value) =>
                        patch(
                          "organizationName",
                          value,
                        )
                      }
                    />
                  </>
                )}

                <TextInput
                  id="email"
                  label="Email address"
                  type="email"
                  value={form.email}
                  placeholder="you@business.com"
                  autoComplete="email"
                  onChange={(value) =>
                    patch("email", value)
                  }
                />

                <PasswordInput
                  id="password"
                  label="Password"
                  value={form.password}
                  placeholder={
                    mode === "register"
                      ? "At least 12 characters"
                      : "Enter your password"
                  }
                  autoComplete={
                    mode === "register"
                      ? "new-password"
                      : "current-password"
                  }
                  onChange={(value) =>
                    patch("password", value)
                  }
                />

                {mode === "register" && (
                  <PasswordInput
                    id="confirmPassword"
                    label="Confirm password"
                    value={form.confirmPassword}
                    placeholder="Repeat your password"
                    autoComplete="new-password"
                    onChange={(value) =>
                      patch(
                        "confirmPassword",
                        value,
                      )
                    }
                  />
                )}

                {security?.enabled && security.siteKey && <AuthChallenge siteKey={security.siteKey} action={mode} generation={challengeGeneration} onToken={setChallengeToken} onError={challengeError} />}
                {!security && !securityFailed && <p role="status" className="text-sm text-[#68757b]">Preparing secure sign in...</p>}
                {securityFailed && <button type="button" onClick={() => void loadSecurity()} className="text-sm font-semibold underline">Retry sign in setup</button>}
                {security?.enabled && <button type="button" disabled={busy} onClick={() => { setError(null); setChallengeToken(null); setChallengeGeneration(current => current + 1); }} className="text-sm font-semibold underline">Retry security check</button>}

                {error && (
                  <div
                    role="alert"
                    aria-live="polite"
                    className="rounded-xl border border-[#efc7c1] bg-[#fff6f4] px-4 py-3 text-sm leading-5 text-[#8a2f25]"
                  >
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={busy || !security || (security.enabled && !challengeToken)}
                  className="flex h-12 w-full items-center justify-center rounded-xl bg-[#0b1519] px-5 text-sm font-bold text-white transition hover:bg-[#142329] focus:outline-none focus-visible:ring-4 focus-visible:ring-[#BAF16D]/45 disabled:cursor-wait disabled:opacity-60"
                >
                  {busy
                    ? "Please wait..."
                    : mode === "login"
                      ? "Sign in"
                      : "Create workspace"}
                </button>
              </form>
            </div>

            <p className="mt-5 text-center text-xs leading-5 text-[#7b878c]">
              Your session is protected with an HttpOnly cookie and
              is not stored in browser storage.
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}

function LoadingScreen() {
  return (
    <main className="grid min-h-screen place-items-center bg-[#f5f7f6] px-6 text-[#081014]">
      <section className="w-full max-w-sm rounded-2xl border border-[#dfe5e2] bg-white px-8 py-10 shadow-[0_18px_55px_rgba(8,16,20,0.07)]">
        <div className="mb-8 flex justify-center">
          <Brand />
        </div>
        <LoadingIndicator label="Opening your workspace..." />
        <p className="mt-5 text-center text-xs leading-5 text-[#7a8782]">
          Restoring your secure session and business workspace.
        </p>
      </section>
    </main>
  );
}

type OnboardingStepId =
  | "identity"
  | "businessType"
  | "mode"
  | "contacts"
  | "theme"
  | "firstItem"
  | "slug"
  | "review";

const ONBOARDING_STEPS: Array<{
  id: OnboardingStepId;
  label: string;
  shortLabel: string;
}> = [
  {
    id: "identity",
    label: "Business identity",
    shortLabel: "Identity",
  },
  {
    id: "businessType",
    label: "Business type",
    shortLabel: "Type",
  },
  {
    id: "mode",
    label: "Catalogue type",
    shortLabel: "Catalogue",
  },
  {
    id: "contacts",
    label: "Contact details",
    shortLabel: "Contacts",
  },
  {
    id: "theme",
    label: "Website style",
    shortLabel: "Theme",
  },
  {
    id: "firstItem",
    label: "First item",
    shortLabel: "First item",
  },
  {
    id: "slug",
    label: "Public URL",
    shortLabel: "URL",
  },
  {
    id: "review",
    label: "Review",
    shortLabel: "Review",
  },
];

function nextOnboardingStep(
  value: OnboardingState,
): OnboardingStepId {
  if (!value.progress.identityComplete) {
    return "identity";
  }

  if (!value.progress.businessTypeComplete) {
    return "businessType";
  }

  if (!value.progress.catalogueStarted) {
    return "mode";
  }

  if (!value.progress.contactsComplete) {
    return "contacts";
  }

  if (!value.progress.themeComplete) {
    return "theme";
  }

  if (!value.progress.firstItemComplete) {
    return "firstItem";
  }

  if (!value.progress.slugComplete) {
    return "slug";
  }

  return "review";
}

function isStepComplete(
  value: OnboardingState,
  step: OnboardingStepId,
): boolean {
  switch (step) {
    case "identity":
      return value.progress.identityComplete;
    case "businessType":
      return value.progress.businessTypeComplete;
    case "mode":
      return value.progress.catalogueStarted;
    case "contacts":
      return value.progress.contactsComplete;
    case "theme":
      return value.progress.themeComplete;
    case "firstItem":
      return value.progress.firstItemComplete;
    case "slug":
      return value.progress.slugComplete;
    case "review":
      return completedSetup(value);
  }
}

function completedSetup(value: OnboardingState | null): boolean {
  return value?.progress.setupComplete ?? value?.progress.readyToPublish ?? false;
}

function normalizedSlugPreview(
  value: string,
): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-+/g, "-")
    .slice(0, 63);
}

function nullableText(
  value: string,
): string | null {
  const trimmed = value.trim();
  return trimmed.length > 0
    ? trimmed
    : null;
}

function SetupField({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  helper,
  disabled = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  type?: string;
  helper?: string;
  disabled?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-semibold text-[#263238]">
        {label}
      </span>
      <input
        type={type}
        value={value}
        disabled={disabled}
        onChange={(event) =>
          onChange(event.target.value)
        }
        placeholder={placeholder}
        className="h-12 w-full rounded-xl border border-[#d8e1dd] bg-white px-4 text-sm text-[#081014] outline-none transition placeholder:text-[#a2aca8] focus:border-[#91b958] focus:ring-4 focus:ring-[#BAF16D]/20 disabled:cursor-not-allowed disabled:bg-[#f3f6f4] disabled:text-[#7b8783]"
      />
      {helper && (
        <span className="mt-2 block text-xs leading-5 text-[#798681]">
          {helper}
        </span>
      )}
    </label>
  );
}

function StepCard({
  active,
  complete,
  number,
  label,
  disabled,
  onClick,
}: {
  active: boolean;
  complete: boolean;
  number: number;
  label: string;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={[
        "flex min-w-[150px] items-center gap-3 rounded-xl border px-3 py-3 text-left transition duration-150 lg:min-w-0 lg:w-full",
        active
          ? "border-[#a8c982] bg-white shadow-[0_5px_18px_rgba(8,16,20,0.05)]"
          : complete
            ? "border-[#e0e6e3] bg-[#fbfcfb]"
            : "border-transparent bg-transparent",
        disabled
          ? "cursor-not-allowed opacity-50"
          : "hover:border-[#cfdcd5] hover:bg-white",
      ].join(" ")}
    >
      <span
        className={[
          "grid size-8 shrink-0 place-items-center rounded-full text-xs font-black",
          complete
            ? "bg-[#eef7e1] text-[#54762d]"
            : active
              ? "bg-[#0b1519] text-white"
              : "bg-[#edf1ef] text-[#78847f]",
        ].join(" ")}
      >
        {complete ? <CheckIcon className="size-4" /> : number}
      </span>
      <span className="min-w-0">
        <span className="block truncate text-xs font-semibold text-[#7a8782]">
          Step {number}
        </span>
        <span className="mt-0.5 block truncate text-sm font-bold text-[#1a252a]">
          {label}
        </span>
      </span>
    </button>
  );
}

function Workspace({
  state,
  onLogout,
}: {
  state: AuthenticatedState;
  onLogout: () => Promise<void>;
}) {
  const [selectedId, setSelectedId] =
    useState(
      state.organizations[0]?.id ?? "",
    );
  const [loggingOut, setLoggingOut] =
    useState(false);
  const [loadingSetup, setLoadingSetup] =
    useState(false);
  const [saving, setSaving] =
    useState(false);
  const [error, setError] =
    useState<string | null>(null);
  const [success, setSuccess] =
    useState<string | null>(null);
  const [onboarding, setOnboarding] =
    useState<OnboardingState | null>(null);
  const [activeStep, setActiveStep] =
    useState<OnboardingStepId>("identity");
  const [workspaceOpen, setWorkspaceOpen] =
    useState(
      () =>
        typeof window !== "undefined"
        && window.location.hash.startsWith(
          "#workspace",
        ),
    );

  const [identityForm, setIdentityForm] =
    useState({
      businessName: "",
      countryCode: "",
      city: "",
    });
  const [businessTypeCode, setBusinessTypeCode] =
    useState("");
  const [catalogueMode, setCatalogueMode] =
    useState<CatalogueMode>("products");
  const [contactForm, setContactForm] =
    useState({
      phone: "",
      whatsappNumber: "",
      email: "",
    });
  const [themeCode, setThemeCode] =
    useState("");
  const [firstItemForm, setFirstItemForm] =
    useState<{
      name: string;
      itemType: "product" | "service";
      shortDescription: string;
    }>({
      name: "",
      itemType: "product",
      shortDescription: "",
    });
  const [slugInput, setSlugInput] =
    useState("");
  const [
    slugAvailability,
    setSlugAvailability,
  ] = useState<SlugAvailability | null>(
    null,
  );

  const selected =
    state.organizations.find(
      (organization) =>
        organization.id === selectedId,
    ) ?? state.organizations[0];

  const canEdit =
    selected?.role === "owner"
    || selected?.role === "admin";

  function syncForms(
    value: OnboardingState,
  ) {
    setIdentityForm({
      businessName:
        value.profile.businessName
        || value.organization.name,
      countryCode:
        value.organization.countryCode ?? "",
      city: value.profile.city ?? "",
    });
    setBusinessTypeCode(
      value.organization.businessType?.code
        ?? "",
    );
    setCatalogueMode(
      value.catalogue?.mode ?? "products",
    );
    setContactForm({
      phone: value.profile.phone ?? "",
      whatsappNumber:
        value.profile.whatsappNumber ?? "",
      email: value.profile.email ?? "",
    });
    setThemeCode(
      value.website.theme?.code
        ?? value.reference.themes[0]?.code
        ?? "",
    );

    if (value.firstItem) {
      setFirstItemForm({
        name: value.firstItem.name,
        itemType: value.firstItem.itemType,
        shortDescription:
          value.firstItem.shortDescription ?? "",
      });
    } else {
      setFirstItemForm((current) => ({
        ...current,
        itemType:
          value.catalogue?.mode === "services"
            ? "service"
            : "product",
      }));
    }

    setSlugInput(
      value.catalogue?.slug
        ?? normalizedSlugPreview(
          value.profile.businessName,
        ),
    );
    setSlugAvailability(null);
  }

  const loadOnboarding =
    useCallback(
      async (organizationId: string) => {
        if (!organizationId) {
          setOnboarding(null);
          return;
        }

        setLoadingSetup(true);
        setError(null);
        setSuccess(null);

        try {
          const value =
            await onboardingApi.state(
              organizationId,
            );

          setOnboarding(value);
          syncForms(value);
          setActiveStep(
            nextOnboardingStep(value),
          );
        } catch (loadError) {
          setOnboarding(null);
          setError(
            messageForError(loadError),
          );
        } finally {
          setLoadingSetup(false);
        }
      },
      [],
    );

  useEffect(() => {
    if (selected?.id) {
      void loadOnboarding(selected.id);
    }
  }, [selected?.id, loadOnboarding]);

  async function logout() {
    setLoggingOut(true);
    setError(null);

    try {
      await onLogout();
    } catch (logoutError) {
      setError(
        messageForError(logoutError),
      );
      setLoggingOut(false);
    }
  }

  function acceptState(
    value: OnboardingState,
    message: string,
  ) {
    setOnboarding(value);
    syncForms(value);
    setActiveStep(
      nextOnboardingStep(value),
    );
    setSuccess(message);
  }

  async function runMutation(
    task: () => Promise<OnboardingState>,
    message: string,
  ) {
    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const value = await task();
      acceptState(value, message);
    } catch (requestError) {
      setError(
        messageForError(requestError),
      );
    } finally {
      setSaving(false);
    }
  }

  if (!selected) {
    return (
      <main className="min-h-screen bg-[#f5f7f6] text-[#081014] [&_a[href]]:cursor-pointer [&_button:not(:disabled)]:cursor-pointer [&_select:not(:disabled)]:cursor-pointer">
        <header className="border-b border-black/[0.07] bg-white">
          <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
            <Brand />
            <button
              type="button"
              onClick={logout}
              disabled={loggingOut}
              className="rounded-xl border border-black/10 bg-white px-4 py-2 text-sm font-semibold"
            >
              Sign out
            </button>
          </div>
        </header>
        <div className="mx-auto max-w-xl px-4 py-16 text-center">
          <h1 className="text-3xl font-semibold">
            No active business workspace
          </h1>
          <p className="mt-3 text-sm leading-6 text-[#6f7c77]">
            Your account does not currently have an active business workspace.
          </p>
        </div>
      </main>
    );
  }

  const completedCount =
    onboarding
      ? [
          onboarding.progress.identityComplete,
          onboarding.progress.businessTypeComplete,
          onboarding.progress.catalogueStarted,
          onboarding.progress.contactsComplete,
          onboarding.progress.themeComplete,
          onboarding.progress.firstItemComplete,
          onboarding.progress.slugComplete,
        ].filter(Boolean).length
      : 0;

  const currentStep =
    onboarding
      ? nextOnboardingStep(onboarding)
      : "identity";

  const catalogueLabel =
    onboarding?.catalogue?.mode === "services"
      ? "service"
      : "product";

  if (
    onboarding !== null
    && completedSetup(onboarding)
    && workspaceOpen
  ) {
    return (
      <DeferredSection label="workspace"><AuthoringWorkspace
        brandLight={<Brand />}
        brandDark={<Brand variant="dark" />}
        user={state.user}
        organizations={state.organizations}
        selectedOrganization={selected}
        catalogueSlug={
          onboarding.catalogue?.slug
          ?? null
        }
        catalogueMode={
          onboarding.catalogue?.mode
          ?? "products"
        }
        businessTypeCode={
          onboarding.organization
            .businessType?.code
          ?? "other"
        }
        onSelectOrganization={(
          organizationId,
        ) => {
          setSelectedId(organizationId);
          setOnboarding(null);
          setActiveStep("identity");
          setError(null);
          setSuccess(null);
        }}
        onEditSetup={() => {
          setWorkspaceOpen(false);
          setActiveStep("review");

          if (
            typeof window !== "undefined"
          ) {
            window.history.replaceState(
              null,
              "",
              "#onboarding/review",
            );
          }
        }}
        onLogout={logout}
        loggingOut={loggingOut}
      /></DeferredSection>
    );
  }

  return (
    <main className="min-h-screen bg-[#f5f7f6] text-[#081014] [&_a[href]]:cursor-pointer [&_button:not(:disabled)]:cursor-pointer [&_select:not(:disabled)]:cursor-pointer">
      <header className="sticky top-0 z-30 border-b border-[#e2e7e4] bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1320px] items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-8">
          <Brand />

          <div className="flex min-w-0 items-center gap-2">
            {state.organizations.length > 1 && (
              <select
                aria-label="Business workspace"
                value={selectedId}
                onChange={(event) => {
                  setSelectedId(
                    event.target.value,
                  );
                  setOnboarding(null);
                  setActiveStep("identity");
                  setError(null);
                  setSuccess(null);
                }}
                className="hidden h-10 max-w-[220px] rounded-xl border border-[#d9e1dd] bg-white px-3 text-sm font-semibold outline-none sm:block"
              >
                {state.organizations.map(
                  (organization) => (
                    <option
                      key={organization.id}
                      value={organization.id}
                    >
                      {organization.name}
                    </option>
                  ),
                )}
              </select>
            )}

            <button
              type="button"
              disabled={loggingOut}
              onClick={logout}
              className="shrink-0 rounded-xl border border-black/10 bg-white px-3 py-2 text-sm font-semibold text-[#344047] transition hover:bg-[#f7f9f8] disabled:opacity-60 sm:px-4"
            >
              {loggingOut
                ? "Signing out..."
                : "Sign out"}
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-[1320px] px-4 py-5 sm:px-6 sm:py-7 lg:px-8">
        {state.organizations.length > 1 && (
          <label className="mb-4 block sm:hidden">
            <span className="mb-2 block text-xs font-bold uppercase tracking-[0.12em] text-[#75817c]">
              Business workspace
            </span>
            <select
              value={selectedId}
              onChange={(event) => {
                setSelectedId(
                  event.target.value,
                );
                setOnboarding(null);
                setActiveStep("identity");
                setError(null);
                setSuccess(null);
              }}
              className="h-11 w-full rounded-xl border border-[#d9e1dd] bg-white px-3 text-sm font-semibold outline-none"
            >
              {state.organizations.map(
                (organization) => (
                  <option
                    key={organization.id}
                    value={organization.id}
                  >
                    {organization.name}
                  </option>
                ),
              )}
            </select>
          </label>
        )}

        <section className="overflow-hidden rounded-2xl border border-[#dfe5e2] bg-white shadow-[0_16px_45px_rgba(8,16,20,0.055)]">
          <div className="grid gap-5 px-5 py-5 sm:px-7 sm:py-6 lg:grid-cols-[1fr_auto] lg:items-center">
            <div>
              <div className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.12em] text-[#5f6d67]">
                <span className="size-1.5 rounded-full bg-[#BAF16D]" />
                Catalogue onboarding
              </div>
              <h1 className="mt-3 max-w-3xl text-2xl font-semibold tracking-[-0.03em] text-[#0b1519] sm:text-3xl">
                Set up your business catalogue.
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-[#68756f]">
                Complete the essentials once. Your progress is saved to this workspace so you can return at any time.
              </p>
            </div>

            <div className="min-w-[190px] rounded-xl bg-[#0b1519] p-4 text-white">
              <div className="flex items-end justify-between gap-3">
                <div>
                  <div className="text-xs font-semibold text-white/45">
                    Setup progress
                  </div>
                  <div className="mt-1 text-2xl font-semibold">
                    {completedCount}/7
                  </div>
                </div>
                <div className="text-xs font-bold text-[#BAF16D]">
                  {Math.round(
                    (completedCount / 7) * 100,
                  )}
                  %
                </div>
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-[#BAF16D] transition-all"
                  style={{
                    width: `${(completedCount / 7) * 100}%`,
                  }}
                />
              </div>
            </div>
          </div>
        </section>

        {error && (
          <div
            role="alert"
            className="mt-4 rounded-xl border border-[#efc7c1] bg-[#fff8f6] px-4 py-3 text-sm text-[#8a2f25]"
          >
            {error}
          </div>
        )}

        {success && (
          <div
            role="status"
            className="mt-4 rounded-xl border border-[#d7e5c8] bg-[#f8fbf4] px-4 py-3 text-sm text-[#486227]"
          >
            {success}
          </div>
        )}

        {loadingSetup || !onboarding ? (
          <div className="mt-5 grid min-h-[360px] place-items-center rounded-2xl border border-[#dfe5e2] bg-white shadow-[0_12px_35px_rgba(8,16,20,0.04)]">
            <LoadingIndicator label="Loading your saved setup..." />
          </div>
        ) : (
          <>
            <div className="mt-5 lg:hidden">
              <label className="block rounded-xl border border-[#dfe5e2] bg-white p-3 shadow-[0_8px_24px_rgba(8,16,20,0.04)]">
                <span className="mb-2 flex items-center justify-between gap-3 text-xs font-semibold text-[#66736e]">
                  <span>Setup navigation</span>
                  <span>Step {ONBOARDING_STEPS.findIndex((step) => step.id === activeStep) + 1} of 8</span>
                </span>
                <select
                  aria-label="Onboarding step"
                  value={activeStep}
                  onChange={(event) =>
                    setActiveStep(
                      event.target.value as OnboardingStepId,
                    )
                  }
                  className="h-11 w-full rounded-lg border border-[#d8e1dd] bg-white px-3 text-sm font-semibold text-[#1f2b30] outline-none focus:border-[#8eb84f] focus:ring-3 focus:ring-[#BAF16D]/20"
                >
                  {ONBOARDING_STEPS.map((step, index) => {
                    const complete = isStepComplete(onboarding, step.id);
                    const disabled =
                      step.id !== currentStep
                      && !complete
                      && step.id !== "review";

                    return (
                      <option
                        key={step.id}
                        value={step.id}
                        disabled={disabled}
                      >
                        {index + 1}. {step.label}{complete ? " - Complete" : ""}
                      </option>
                    );
                  })}
                </select>
              </label>
            </div>

            <div className="mt-5 grid gap-5 lg:grid-cols-[250px_minmax(0,1fr)]">
              <aside className="hidden self-start rounded-2xl border border-[#dfe5e2] bg-white p-3 shadow-[0_10px_30px_rgba(8,16,20,0.04)] lg:block">
                <div className="px-3 pb-3 pt-2">
                  <p className="text-xs font-black uppercase tracking-[0.14em] text-[#789c45]">
                    Setup steps
                  </p>
                  <p className="mt-1 text-xs leading-5 text-[#7d8984]">
                    Completed steps stay editable until publishing.
                  </p>
                </div>

                <div className="space-y-1">
                  {ONBOARDING_STEPS.map(
                    (step, index) => {
                      const complete =
                        isStepComplete(
                          onboarding,
                          step.id,
                        );
                      const disabled =
                        step.id !== currentStep
                        && !complete
                        && step.id !== "review";

                      return (
                        <StepCard
                          key={step.id}
                          number={index + 1}
                          label={step.label}
                          active={
                            activeStep === step.id
                          }
                          complete={complete}
                          disabled={disabled}
                          onClick={() =>
                            setActiveStep(
                              step.id,
                            )
                          }
                        />
                      );
                    },
                  )}
                </div>

                <div className="mt-3 rounded-xl border border-[#e5eae7] bg-[#f8faf9] p-4">
                  <div className="text-xs font-bold uppercase tracking-[0.12em] text-[#7e8985]">
                    Active business
                  </div>
                  <div className="mt-2 text-sm font-bold">
                    {selected.name}
                  </div>
                  <div className="mt-1 text-xs capitalize text-[#7c8883]">
                    {selected.role} access
                  </div>
                </div>
              </aside>

              <section className="min-w-0 rounded-2xl border border-[#dfe5e2] bg-white p-5 shadow-[0_14px_40px_rgba(8,16,20,0.045)] sm:p-8">
                {!canEdit && (
                  <div className="mb-6 rounded-2xl border border-[#e2dfc8] bg-[#fffdf1] px-4 py-3 text-sm leading-6 text-[#736a34]">
                    You have editor access. Onboarding setup is read-only; an owner or admin can make changes.
                  </div>
                )}

                {activeStep === "identity" && (
                  <form
                    onSubmit={(event) => {
                      event.preventDefault();

                      if (!canEdit) {
                        return;
                      }

                      void runMutation(
                        () =>
                          onboardingApi.updateIdentity(
                            selected.id,
                            identityForm,
                          ),
                        "Business identity saved.",
                      );
                    }}
                  >
                    <div className="max-w-2xl">
                      <p className="text-xs font-black uppercase tracking-[0.14em] text-[#789c45]">
                        Step 1 - Business identity
                      </p>
                      <h2 className="mt-3 text-2xl font-semibold tracking-[-0.025em] sm:text-3xl">
                        Start with the essentials.
                      </h2>
                      <p className="mt-3 text-sm leading-6 text-[#6f7c77]">
                        These details anchor your catalogue and help us create the right business experience.
                      </p>
                    </div>

                    <div className="mt-7 grid gap-5 sm:grid-cols-2">
                      <div className="sm:col-span-2">
                        <SetupField
                          label="Business name"
                          value={
                            identityForm.businessName
                          }
                          onChange={(businessName) =>
                            setIdentityForm(
                              (current) => ({
                                ...current,
                                businessName,
                              }),
                            )
                          }
                          placeholder="Acme Industries"
                          disabled={!canEdit}
                        />
                      </div>

                      <SetupField
                        label="Country code"
                        value={
                          identityForm.countryCode
                        }
                        onChange={(countryCode) =>
                          setIdentityForm(
                            (current) => ({
                              ...current,
                              countryCode:
                                countryCode
                                  .toUpperCase(),
                            }),
                          )
                        }
                        placeholder="IN"
                        helper="Use the 2-letter country code, for example IN."
                        disabled={!canEdit}
                      />

                      <SetupField
                        label="City"
                        value={identityForm.city}
                        onChange={(city) =>
                          setIdentityForm(
                            (current) => ({
                              ...current,
                              city,
                            }),
                          )
                        }
                        placeholder="Mumbai"
                        disabled={!canEdit}
                      />
                    </div>

                    <div className="mt-8 flex justify-end">
                      <button
                        type="submit"
                        disabled={
                          saving || !canEdit
                        }
                        className="h-12 rounded-xl bg-[#0b1519] px-6 text-sm font-bold text-white transition hover:bg-[#17262c] disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {saving
                          ? "Saving..."
                          : "Save & continue"}
                      </button>
                    </div>
                  </form>
                )}

                {activeStep === "businessType" && (
                  <form
                    onSubmit={(event) => {
                      event.preventDefault();

                      if (
                        !canEdit
                        || !businessTypeCode
                      ) {
                        return;
                      }

                      void runMutation(
                        () =>
                          onboardingApi.updateBusinessType(
                            selected.id,
                            businessTypeCode,
                          ),
                        "Business type saved.",
                      );
                    }}
                  >
                    <p className="text-xs font-black uppercase tracking-[0.14em] text-[#789c45]">
                      Step 2 - Business type
                    </p>
                    <h2 className="mt-3 text-2xl font-semibold tracking-[-0.025em] sm:text-3xl">
                      What kind of business is this?
                    </h2>
                    <p className="mt-3 max-w-2xl text-sm leading-6 text-[#6f7c77]">
                      Your choice gives us better field suggestions without locking you into a rigid template.
                    </p>

                    <div className="mt-7 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                      {onboarding.reference.businessTypes.map(
                        (businessType) => {
                          const selectedType =
                            businessTypeCode
                            === businessType.code;

                          return (
                            <button
                              key={
                                businessType.code
                              }
                              type="button"
                              disabled={!canEdit}
                              onClick={() =>
                                setBusinessTypeCode(
                                  businessType.code,
                                )
                              }
                              className={[
                                "rounded-xl border p-4 text-left transition",
                                selectedType
                                  ? "border-[#93b964] bg-[#fbfdf8] shadow-[inset_3px_0_0_#BAF16D]"
                                  : "border-[#dfe6e2] bg-white hover:border-[#becbc4]",
                                !canEdit
                                  ? "cursor-not-allowed opacity-60"
                                  : "",
                              ].join(" ")}
                            >
                              <div className="text-sm font-bold text-[#1a252a]">
                                {
                                  businessType.name
                                }
                              </div>
                              <div className="mt-1 text-xs leading-5 text-[#7a8782]">
                                {businessType.description
                                  ?? "A flexible catalogue setup for this business type."}
                              </div>
                            </button>
                          );
                        },
                      )}
                    </div>

                    {onboarding.reference
                      .suggestedAttributes
                      .length > 0 && (
                      <div className="mt-6 rounded-2xl bg-[#f6f8f7] p-4">
                        <p className="text-xs font-bold uppercase tracking-[0.12em] text-[#78847f]">
                          Suggested catalogue fields
                        </p>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {onboarding.reference.suggestedAttributes
                            .slice(0, 8)
                            .map(
                              (attribute) => (
                                <span
                                  key={
                                    attribute.code
                                  }
                                  className="rounded-full border border-[#d9e2dd] bg-white px-3 py-1.5 text-xs font-semibold text-[#56625d]"
                                >
                                  {
                                    attribute.label
                                  }
                                </span>
                              ),
                            )}
                        </div>
                      </div>
                    )}

                    <div className="mt-8 flex justify-end">
                      <button
                        type="submit"
                        disabled={
                          saving
                          || !canEdit
                          || !businessTypeCode
                        }
                        className="h-12 rounded-xl bg-[#0b1519] px-6 text-sm font-bold text-white disabled:opacity-50"
                      >
                        {saving
                          ? "Saving..."
                          : "Save & continue"}
                      </button>
                    </div>
                  </form>
                )}

                {activeStep === "mode" && (
                  <form
                    onSubmit={(event) => {
                      event.preventDefault();

                      if (!canEdit) {
                        return;
                      }

                      void runMutation(
                        () =>
                          onboardingApi.updateCatalogueMode(
                            selected.id,
                            catalogueMode,
                          ),
                        "Catalogue type saved.",
                      );
                    }}
                  >
                    <p className="text-xs font-black uppercase tracking-[0.14em] text-[#789c45]">
                      Step 3 - Catalogue type
                    </p>
                    <h2 className="mt-3 text-2xl font-semibold tracking-[-0.025em] sm:text-3xl">
                      What will you showcase?
                    </h2>
                    <p className="mt-3 max-w-2xl text-sm leading-6 text-[#6f7c77]">
                      You can build a catalogue for products, services, or both.
                    </p>

                    <div className="mt-7 grid gap-4 md:grid-cols-3">
                      {(
                        [
                          [
                            "products",
                            "Products",
                            "Physical or digital products, equipment, goods and inventory.",
                          ],
                          [
                            "services",
                            "Services",
                            "Consulting, professional work, maintenance and service offerings.",
                          ],
                          [
                            "both",
                            "Products & services",
                            "A mixed catalogue when your business offers both.",
                          ],
                        ] as const
                      ).map(
                        ([
                          mode,
                          label,
                          description,
                        ]) => (
                          <button
                            key={mode}
                            type="button"
                            disabled={!canEdit}
                            onClick={() =>
                              setCatalogueMode(
                                mode,
                              )
                            }
                            className={[
                              "rounded-xl border p-5 text-left transition",
                              catalogueMode === mode
                                ? "border-[#93b964] bg-[#fbfdf8] shadow-[inset_3px_0_0_#BAF16D]"
                                : "border-[#dfe6e2] hover:border-[#becbc4]",
                              !canEdit
                                ? "cursor-not-allowed opacity-60"
                                : "",
                            ].join(" ")}
                          >
                            <div className="text-base font-bold">
                              {label}
                            </div>
                            <div className="mt-2 text-sm leading-6 text-[#74807b]">
                              {description}
                            </div>
                          </button>
                        ),
                      )}
                    </div>

                    <div className="mt-8 flex justify-end">
                      <button
                        type="submit"
                        disabled={
                          saving || !canEdit
                        }
                        className="h-12 rounded-xl bg-[#0b1519] px-6 text-sm font-bold text-white disabled:opacity-50"
                      >
                        {saving
                          ? "Saving..."
                          : "Save & continue"}
                      </button>
                    </div>
                  </form>
                )}

                {activeStep === "contacts" && (
                  <form
                    onSubmit={(event) => {
                      event.preventDefault();

                      if (!canEdit) {
                        return;
                      }

                      void runMutation(
                        () =>
                          onboardingApi.updateContacts(
                            selected.id,
                            {
                              phone:
                                nullableText(
                                  contactForm.phone,
                                ),
                              whatsappNumber:
                                nullableText(
                                  contactForm.whatsappNumber,
                                ),
                              email:
                                nullableText(
                                  contactForm.email,
                                ),
                            },
                          ),
                        "Contact details saved.",
                      );
                    }}
                  >
                    <p className="text-xs font-black uppercase tracking-[0.14em] text-[#789c45]">
                      Step 4 - Contact details
                    </p>
                    <h2 className="mt-3 text-2xl font-semibold tracking-[-0.025em] sm:text-3xl">
                      Give customers a clear way to reach you.
                    </h2>
                    <p className="mt-3 max-w-2xl text-sm leading-6 text-[#6f7c77]">
                      Add at least one contact method. WhatsApp is treated as a first-class enquiry option.
                    </p>

                    <div className="mt-7 grid gap-5 sm:grid-cols-2">
                      <SetupField
                        label="Phone"
                        value={contactForm.phone}
                        onChange={(phone) =>
                          setContactForm(
                            (current) => ({
                              ...current,
                              phone,
                            }),
                          )
                        }
                        placeholder="+91 22 5555 1234"
                        disabled={!canEdit}
                      />

                      <SetupField
                        label="WhatsApp"
                        value={
                          contactForm.whatsappNumber
                        }
                        onChange={(
                          whatsappNumber,
                        ) =>
                          setContactForm(
                            (current) => ({
                              ...current,
                              whatsappNumber,
                            }),
                          )
                        }
                        placeholder="+91 98765 43210"
                        disabled={!canEdit}
                      />

                      <div className="sm:col-span-2">
                        <SetupField
                          label="Business email"
                          type="email"
                          value={contactForm.email}
                          onChange={(email) =>
                            setContactForm(
                              (current) => ({
                                ...current,
                                email,
                              }),
                            )
                          }
                          placeholder="sales@example.com"
                          disabled={!canEdit}
                        />
                      </div>
                    </div>

                    <div className="mt-8 flex justify-end">
                      <button
                        type="submit"
                        disabled={
                          saving || !canEdit
                        }
                        className="h-12 rounded-xl bg-[#0b1519] px-6 text-sm font-bold text-white disabled:opacity-50"
                      >
                        {saving
                          ? "Saving..."
                          : "Save & continue"}
                      </button>
                    </div>
                  </form>
                )}

                {activeStep === "theme" && (
                  <form
                    onSubmit={(event) => {
                      event.preventDefault();

                      if (
                        !canEdit
                        || !themeCode
                      ) {
                        return;
                      }

                      void runMutation(
                        () =>
                          onboardingApi.updateTheme(
                            selected.id,
                            themeCode,
                          ),
                        "Website style saved.",
                      );
                    }}
                  >
                    <p className="text-xs font-black uppercase tracking-[0.14em] text-[#789c45]">
                      Step 5 - Website style
                    </p>
                    <h2 className="mt-3 text-2xl font-semibold tracking-[-0.025em] sm:text-3xl">
                      Choose a polished starting look.
                    </h2>
                    <p className="mt-3 max-w-2xl text-sm leading-6 text-[#6f7c77]">
                      Themes control the visual system without turning setup into a complicated website builder.
                    </p>

                    <div className="mt-7 grid gap-4 md:grid-cols-2">
                      {onboarding.reference.themes.map(
                        (theme) => {
                          const selectedTheme =
                            theme.code
                            === themeCode;

                          return (
                            <button
                              key={theme.code}
                              type="button"
                              disabled={!canEdit}
                              onClick={() =>
                                setThemeCode(
                                  theme.code,
                                )
                              }
                              className={[
                                "overflow-hidden rounded-2xl border text-left transition",
                                selectedTheme
                                  ? "border-[#91b958] ring-2 ring-[#BAF16D]/25"
                                  : "border-[#dfe6e2]",
                                !canEdit
                                  ? "cursor-not-allowed opacity-60"
                                  : "",
                              ].join(" ")}
                            >
                              <div className="bg-[#0b1519] p-5 text-white">
                                <div className="flex items-center justify-between">
                                  <div className="text-xs font-black tracking-[0.14em] text-[#BAF16D]">
                                    TECHABANCA
                                  </div>
                                  <div className="size-3 rounded-full bg-[#BAF16D]" />
                                </div>
                                <div className="mt-7 h-3 w-2/3 rounded-full bg-white/85" />
                                <div className="mt-3 h-2 w-full rounded-full bg-white/20" />
                                <div className="mt-2 h-2 w-4/5 rounded-full bg-white/20" />
                              </div>
                              <div className="p-5">
                                <div className="text-base font-bold">
                                  {theme.name}
                                </div>
                                <div className="mt-1 text-sm leading-6 text-[#74807b]">
                                  {theme.description
                                    ?? "A controlled, professional catalogue presentation."}
                                </div>
                              </div>
                            </button>
                          );
                        },
                      )}
                    </div>

                    <div className="mt-8 flex justify-end">
                      <button
                        type="submit"
                        disabled={
                          saving
                          || !canEdit
                          || !themeCode
                        }
                        className="h-12 rounded-xl bg-[#0b1519] px-6 text-sm font-bold text-white disabled:opacity-50"
                      >
                        {saving
                          ? "Saving..."
                          : "Save & continue"}
                      </button>
                    </div>
                  </form>
                )}

                {activeStep === "firstItem" && (
                  onboarding.firstItem ? (
                    <div>
                      <p className="text-xs font-black uppercase tracking-[0.14em] text-[#789c45]">
                        Step 6 - First item
                      </p>
                      <h2 className="mt-3 text-2xl font-semibold tracking-[-0.025em] sm:text-3xl">
                        Your first {catalogueLabel} is ready.
                      </h2>
                      <div className="mt-7 rounded-2xl border border-[#dfe6e2] bg-[#f8faf9] p-5">
                        <div className="text-xs font-bold uppercase tracking-[0.12em] text-[#7b8782]">
                          {onboarding.firstItem.itemType}
                        </div>
                        <div className="mt-2 text-xl font-semibold">
                          {onboarding.firstItem.name}
                        </div>
                        {onboarding.firstItem.shortDescription && (
                          <p className="mt-2 text-sm leading-6 text-[#6f7c77]">
                            {onboarding.firstItem.shortDescription}
                          </p>
                        )}
                        <div className="mt-4 text-xs text-[#8a9691]">
                          Draft item - /{onboarding.firstItem.slug}
                        </div>
                      </div>
                      <div className="mt-8 flex justify-end">
                        <button
                          type="button"
                          onClick={() =>
                            setActiveStep("slug")
                          }
                          className="h-12 rounded-xl bg-[#0b1519] px-6 text-sm font-bold text-white"
                        >
                          Continue
                        </button>
                      </div>
                    </div>
                  ) : (
                    <form
                      onSubmit={(event) => {
                        event.preventDefault();

                        if (!canEdit) {
                          return;
                        }

                        void runMutation(
                          () =>
                            onboardingApi.createFirstItem(
                              selected.id,
                              {
                                name:
                                  firstItemForm.name,
                                itemType:
                                  onboarding.catalogue
                                    ?.mode
                                  === "both"
                                    ? firstItemForm.itemType
                                    : undefined,
                                shortDescription:
                                  nullableText(
                                    firstItemForm.shortDescription,
                                  ),
                              },
                            ),
                          "First catalogue item created.",
                        );
                      }}
                    >
                      <p className="text-xs font-black uppercase tracking-[0.14em] text-[#789c45]">
                        Step 6 - First item
                      </p>
                      <h2 className="mt-3 text-2xl font-semibold tracking-[-0.025em] sm:text-3xl">
                        Add one {catalogueLabel} to make the catalogue feel real.
                      </h2>
                      <p className="mt-3 max-w-2xl text-sm leading-6 text-[#6f7c77]">
                        Keep this first entry simple. Full catalogue authoring comes in the next milestone.
                      </p>

                      <div className="mt-7 space-y-5">
                        <SetupField
                          label={
                            onboarding.catalogue?.mode
                            === "services"
                              ? "Service name"
                              : "Product name"
                          }
                          value={
                            firstItemForm.name
                          }
                          onChange={(name) =>
                            setFirstItemForm(
                              (current) => ({
                                ...current,
                                name,
                              }),
                            )
                          }
                          placeholder={
                            onboarding.catalogue?.mode
                            === "services"
                              ? "Annual Maintenance"
                              : "Heavy Duty Pump"
                          }
                          disabled={!canEdit}
                        />

                        {onboarding.catalogue?.mode
                          === "both" && (
                          <div>
                            <div className="mb-2 text-sm font-semibold text-[#263238]">
                              Item type
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                              {(
                                [
                                  "product",
                                  "service",
                                ] as const
                              ).map(
                                (itemType) => (
                                  <button
                                    key={itemType}
                                    type="button"
                                    disabled={!canEdit}
                                    onClick={() =>
                                      setFirstItemForm(
                                        (current) => ({
                                          ...current,
                                          itemType,
                                        }),
                                      )
                                    }
                                    className={[
                                      "h-12 rounded-xl border text-sm font-bold capitalize transition",
                                      firstItemForm.itemType
                                      === itemType
                                        ? "border-[#91b958] bg-[#f4faea]"
                                        : "border-[#dfe6e2] bg-white",
                                    ].join(" ")}
                                  >
                                    {itemType}
                                  </button>
                                ),
                              )}
                            </div>
                          </div>
                        )}

                        <label className="block">
                          <span className="mb-2 block text-sm font-semibold text-[#263238]">
                            Short description
                          </span>
                          <textarea
                            rows={4}
                            value={
                              firstItemForm.shortDescription
                            }
                            disabled={!canEdit}
                            onChange={(event) =>
                              setFirstItemForm(
                                (current) => ({
                                  ...current,
                                  shortDescription:
                                    event.target.value,
                                }),
                              )
                            }
                            placeholder="A short customer-friendly description."
                            className="w-full resize-none rounded-xl border border-[#d8e1dd] bg-white px-4 py-3 text-sm outline-none focus:border-[#91b958] focus:ring-4 focus:ring-[#BAF16D]/20 disabled:bg-[#f3f6f4]"
                          />
                        </label>
                      </div>

                      <div className="mt-8 flex justify-end">
                        <button
                          type="submit"
                          disabled={
                            saving
                            || !canEdit
                            || firstItemForm.name.trim()
                              .length === 0
                          }
                          className="h-12 rounded-xl bg-[#0b1519] px-6 text-sm font-bold text-white disabled:opacity-50"
                        >
                          {saving
                            ? "Creating..."
                            : "Create & continue"}
                        </button>
                      </div>
                    </form>
                  )
                )}

                {activeStep === "slug" && (
                  <form
                    onSubmit={(event) => {
                      event.preventDefault();

                      if (!canEdit) {
                        return;
                      }

                      void runMutation(
                        () =>
                          onboardingApi.claimSlug(
                            selected.id,
                            slugInput,
                          ),
                        "Public catalogue URL reserved.",
                      );
                    }}
                  >
                    <p className="text-xs font-black uppercase tracking-[0.14em] text-[#789c45]">
                      Step 7 - Public URL
                    </p>
                    <h2 className="mt-3 text-2xl font-semibold tracking-[-0.025em] sm:text-3xl">
                      Reserve a memorable catalogue address.
                    </h2>
                    <p className="mt-3 max-w-2xl text-sm leading-6 text-[#6f7c77]">
                      This reserves your Techabanca subdomain. It will not become publicly visible until the publishing milestone is enabled.
                    </p>

                    <div className="mt-7 max-w-2xl">
                      <label className="block">
                        <span className="mb-2 block text-sm font-semibold text-[#263238]">
                          Catalogue URL
                        </span>
                        <div className="flex min-w-0 overflow-hidden rounded-xl border border-[#d8e1dd] bg-white focus-within:border-[#91b958] focus-within:ring-4 focus-within:ring-[#BAF16D]/20">
                          <input
                            value={slugInput}
                            disabled={!canEdit}
                            onChange={(event) => {
                              setSlugInput(
                                event.target.value,
                              );
                              setSlugAvailability(
                                null,
                              );
                            }}
                            placeholder="acme-industries"
                            className="h-12 min-w-0 flex-1 border-0 bg-transparent px-4 text-sm outline-none disabled:bg-[#f3f6f4]"
                          />
                          <div className="hidden items-center border-l border-[#e3e9e5] bg-[#f8faf9] px-4 text-xs font-semibold text-[#718078] sm:flex">
                            .techabanca.com
                          </div>
                        </div>
                        <div className="mt-2 break-all text-xs text-[#7b8782] sm:hidden">
                          {normalizedSlugPreview(
                            slugInput,
                          ) || "your-name"}
                          .techabanca.com
                        </div>
                      </label>

                      {slugAvailability && (
                        <div
                          className={[
                            "mt-3 rounded-xl px-4 py-3 text-sm font-semibold",
                            slugAvailability.available
                              ? "bg-[#f1f9e6] text-[#52732a]"
                              : "bg-[#fff4f1] text-[#8a3a2d]",
                          ].join(" ")}
                        >
                          {slugAvailability.available
                            ? `${slugAvailability.slug}.techabanca.com is available.`
                            : slugAvailability.reason
                              === "reserved"
                              ? "That address is reserved."
                              : slugAvailability.reason
                                === "claimed"
                                ? "That address is already in use."
                                : "Choose a valid catalogue address."}
                        </div>
                      )}

                      <div className="mt-5 flex flex-col gap-3 sm:flex-row">
                        <button
                          type="button"
                          disabled={
                            saving
                            || !canEdit
                            || slugInput.trim()
                              .length === 0
                          }
                          onClick={() => {
                            setSaving(true);
                            setError(null);
                            setSuccess(null);

                            void onboardingApi
                              .slugAvailability(
                                selected.id,
                                slugInput,
                              )
                              .then(
                                (availability) => {
                                  setSlugAvailability(
                                    availability,
                                  );
                                },
                              )
                              .catch(
                                (requestError) => {
                                  setError(
                                    messageForError(
                                      requestError,
                                    ),
                                  );
                                },
                              )
                              .finally(() =>
                                setSaving(false),
                              );
                          }}
                          className="h-12 rounded-xl border border-[#cfd9d3] bg-white px-5 text-sm font-bold text-[#34413b] disabled:opacity-50"
                        >
                          Check availability
                        </button>

                        <button
                          type="submit"
                          disabled={
                            saving
                            || !canEdit
                            || slugInput.trim()
                              .length === 0
                          }
                          className="h-12 rounded-xl bg-[#0b1519] px-6 text-sm font-bold text-white disabled:opacity-50"
                        >
                          {saving
                            ? "Saving..."
                            : onboarding.progress.slugComplete
                              ? "Save URL"
                              : "Reserve URL"}
                        </button>
                      </div>
                    </div>
                  </form>
                )}

                {activeStep === "review" && (
                  <div>
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <p className="text-xs font-black uppercase tracking-[0.14em] text-[#789c45]">
                          Final review
                        </p>
                        <h2 className="mt-3 text-2xl font-semibold tracking-[-0.025em] sm:text-3xl">
                          Catalogue setup is complete.
                        </h2>
                        <p className="mt-3 max-w-2xl text-sm leading-6 text-[#6f7c77]">
                          The required business, catalogue, contact, theme, item, and URL details are saved. Publishing remains a separate controlled action.
                        </p>
                      </div>

                      <div
                        className={[
                          "inline-flex shrink-0 items-center gap-2 rounded-lg border px-3 py-2 text-xs font-bold",
                          completedSetup(onboarding)
                            ? "border-[#cfe2b4] bg-[#f7fbf2] text-[#3f5f1f]"
                            : "border-[#dfe5e2] bg-[#f7f9f8] text-[#68756f]",
                        ].join(" ")}
                      >
                        <span
                          className={[
                            "size-2 rounded-full",
                            completedSetup(onboarding)
                              ? "bg-[#8fc84a]"
                              : "bg-[#a7b0ac]",
                          ].join(" ")}
                        />
                        {completedSetup(onboarding)
                          ? "Setup complete"
                          : "Setup incomplete"}
                      </div>
                    </div>

                    <div className="mt-7 grid gap-4 md:grid-cols-2">
                      <div className="rounded-xl border border-[#e0e6e3] bg-[#fbfcfb] p-5">
                        <div className="text-xs font-black uppercase tracking-[0.12em] text-[#7c8883]">
                          Business
                        </div>
                        <div className="mt-2 text-lg font-semibold">
                          {onboarding.profile.businessName}
                        </div>
                        <div className="mt-1 text-sm text-[#74807b]">
                          {onboarding.organization.businessType?.name
                            ?? "Business type"}
                          {" - "}
                          {onboarding.profile.city}
                        </div>
                      </div>

                      <div className="rounded-xl border border-[#e0e6e3] bg-[#fbfcfb] p-5">
                        <div className="text-xs font-black uppercase tracking-[0.12em] text-[#7c8883]">
                          Reserved URL
                        </div>
                        <div className="mt-2 break-all text-lg font-semibold">
                          {onboarding.catalogue?.slug
                            ? `${onboarding.catalogue.slug}.techabanca.com`
                            : "Not reserved"}
                        </div>
                        <div className="mt-1 text-sm text-[#74807b]">
                          Review live status and publishing in Website
                        </div>
                      </div>

                      <div className="rounded-xl border border-[#e0e6e3] bg-[#fbfcfb] p-5">
                        <div className="text-xs font-black uppercase tracking-[0.12em] text-[#7c8883]">
                          First item
                        </div>
                        <div className="mt-2 text-lg font-semibold">
                          {onboarding.firstItem?.name
                            ?? "Not added"}
                        </div>
                        <div className="mt-1 text-sm capitalize text-[#74807b]">
                          {onboarding.firstItem?.itemType
                            ?? "item"}
                          {" - "}
                          {onboarding.firstItem?.status
                            ?? "draft"}
                        </div>
                      </div>

                      <div className="rounded-xl border border-[#e0e6e3] bg-[#fbfcfb] p-5">
                        <div className="text-xs font-black uppercase tracking-[0.12em] text-[#7c8883]">
                          Website style
                        </div>
                        <div className="mt-2 text-lg font-semibold">
                          {onboarding.website.theme?.name
                            ?? "Not selected"}
                        </div>
                        <div className="mt-1 text-sm text-[#74807b]">
                          Techabanca managed theme
                        </div>
                      </div>
                    </div>

                    {completedSetup(onboarding) && (
                      <div className="mt-7 flex flex-col gap-3 rounded-xl border border-[#d8e2d3] bg-[#fbfdf8] p-4 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <div className="text-sm font-semibold text-[#1f2b30]">
                            Continue to catalogue authoring
                          </div>
                          <p className="mt-1 text-xs leading-5 text-[#6f7c77]">
                            Open your workspace to manage saved content, private previews and publishing.
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setWorkspaceOpen(true);

                            if (
                              typeof window
                                !== "undefined"
                            ) {
                              window.history.replaceState(
                                null,
                                "",
                                "#workspace/home",
                              );
                            }
                          }}
                          className="h-11 shrink-0 rounded-xl bg-[#0b1519] px-5 text-sm font-bold text-white transition hover:bg-[#152126]"
                        >
                          Open workspace
                        </button>
                      </div>
                    )}

                    <div className="mt-7 rounded-xl border border-[#dfe5e2] bg-[#f8faf9] p-5">
                      <div className="flex gap-3">
                        <div className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-[#eef7e1] text-[#52742c]">
                          <CheckIcon className="size-4" />
                        </div>
                        <div>
                          <div className="text-sm font-semibold text-[#1f2b30]">
                            Setup saved to your workspace
                          </div>
                          <p className="mt-1 text-sm leading-6 text-[#6f7c77]">
                            You can sign out and return later. Your onboarding progress will resume from the saved state.
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </section>
            </div>
          </>
        )}
      </div>
    </main>
  );
}

export function App() {
  const [adminOpen,setAdminOpen]=useState(()=>window.location.hash==="#admin");
  useEffect(()=>{const change=()=>setAdminOpen(window.location.hash==="#admin");window.addEventListener("hashchange",change);return()=>window.removeEventListener("hashchange",change);},[]);
  const [loading, setLoading] =
    useState(true);
  const [authenticated, setAuthenticated] =
    useState<AuthenticatedState | null>(
      null,
    );
  const [bootstrapError, setBootstrapError] =
    useState<string | null>(null);

  const bootstrap = useCallback(
    async () => {
      setBootstrapError(null);

      try {
        const session =
          await authApi.session();

        if (!session) {
          setAuthenticated(null);
          return;
        }

        const organizationData =
          await authApi.organizations();

        const platformAccess=await adminApi.access().catch(()=>({enabled:false}));
        setAuthenticated({
          platformAdmin:platformAccess.enabled,
          user: session.user,
          organizations:
            organizationData.organizations,
        });
      } catch (error) {
        setBootstrapError(
          messageForError(error),
        );
        setAuthenticated(null);
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  async function authenticatedNow() {
    setLoading(true);
    await bootstrap();
  }

  async function logout() {
    await authApi.logout();
    setAuthenticated(null);
  }

  if (loading) {
    return <LoadingScreen />;
  }

  if (authenticated) {
    if(adminOpen)return <DeferredSection label="administration"><AdminConsole brand={<Brand/>} user={authenticated.user.displayName} onLogout={logout}/></DeferredSection>;
    return (
      <>
      {authenticated.platformAdmin&&<div className="flex justify-end border-b border-[#dfe5dc] bg-[#f1f7e9] px-5 py-2 text-xs font-semibold"><a href="#admin" className="rounded px-3 py-1 text-[#46622b] underline">Platform administration</a></div>}
      <Workspace
        state={authenticated}
        onLogout={logout}
      />
      </>
    );
  }

  return (
    <>
      <AuthScreen
        onAuthenticated={authenticatedNow}
      />
      {bootstrapError && (
        <div className="fixed inset-x-4 bottom-4 z-20 mx-auto max-w-xl rounded-xl border border-[#efc7c1] bg-[#fff6f4] px-4 py-3 text-center text-sm text-[#8a2f25] shadow-lg">
          {bootstrapError}
        </div>
      )}
    </>
  );
}
