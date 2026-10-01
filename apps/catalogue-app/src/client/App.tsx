import {
  type FormEvent,
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

type AuthMode = "login" | "register";

type AuthenticatedState = {
  user: AuthUser;
  organizations: AuthOrganization[];
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
  if (error instanceof AuthApiError) {
    return error.message;
  }

  return "Something went wrong. Please try again.";
}

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

function ButtonSpinner() {
  return (
    <span
      aria-hidden="true"
      className="size-4 animate-spin rounded-full border-2 border-current border-r-transparent"
    />
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
          className="absolute inset-y-0 right-0 grid w-12 cursor-pointer place-items-center text-[#69767c] transition hover:text-[#081014] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#769f39]"
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
    setError(null);
    setForm(EMPTY_FORM);
  }

  async function submit(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();
    setError(null);

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
        });
      } else {
        await authApi.register({
          email: form.email,
          password: form.password,
          displayName:
            form.displayName,
          organizationName:
            form.organizationName,
        });
      }

      await onAuthenticated();
    } catch (requestError) {
      setError(
        messageForError(requestError),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#f2f6f3] text-[#081014]">
      <div className="mx-auto grid min-h-screen w-full max-w-[1440px] lg:grid-cols-[1.02fr_0.98fr]">
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
          <div className="w-full max-w-[520px]">
            <div className="mb-8 lg:hidden">
              <Brand />
            </div>

            <div className="rounded-[28px] border border-black/[0.07] bg-white p-5 shadow-[0_24px_80px_rgba(8,16,20,0.08)] sm:p-8">
              <div className="rounded-2xl bg-[#eef3f0] p-1">
                <div className="grid grid-cols-2 gap-1">
                  <button
                    type="button"
                    onClick={() =>
                      switchMode("login")
                    }
                    className={`h-10 cursor-pointer rounded-xl text-sm font-semibold transition ${
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
                    className={`h-10 cursor-pointer rounded-xl text-sm font-semibold transition ${
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
                  disabled={busy}
                  aria-busy={busy}
                  aria-label={
                    busy
                      ? mode === "login"
                        ? "Signing in"
                        : "Creating workspace"
                      : undefined
                  }
                  className="flex h-12 w-full cursor-pointer items-center justify-center rounded-xl bg-[#0b1519] px-5 text-sm font-bold text-white transition hover:bg-[#142329] focus:outline-none focus-visible:ring-4 focus-visible:ring-[#BAF16D]/45 disabled:cursor-wait disabled:opacity-60"
                >
                  {busy ? (
                    <ButtonSpinner />
                  ) : mode === "login" ? (
                    "Sign in"
                  ) : (
                    "Create workspace"
                  )}
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
    <main className="grid min-h-screen place-items-center bg-[#f2f6f3] px-6 text-[#081014]">
      <div className="text-center">
        <div className="mx-auto grid size-12 place-items-center rounded-2xl bg-[#081014] text-sm font-black text-[#BAF16D]">
          T
        </div>
        <div className="mt-4 text-sm font-semibold">
          Opening your workspaceâ€¦
        </div>
      </div>
    </main>
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
  const [error, setError] =
    useState<string | null>(null);

  const selected =
    state.organizations.find(
      (organization) =>
        organization.id === selectedId,
    ) ?? state.organizations[0];

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

  return (
    <main className="min-h-screen bg-[#f2f6f3] text-[#081014]">
      <header className="border-b border-black/[0.07] bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-4 sm:px-8">
          <Brand />
          <button
            type="button"
            disabled={loggingOut}
            aria-busy={loggingOut}
            aria-label={
              loggingOut
                ? "Signing out"
                : undefined
            }
            onClick={logout}
            className="flex min-h-10 min-w-[92px] cursor-pointer items-center justify-center rounded-xl border border-black/10 bg-white px-4 py-2 text-sm font-semibold text-[#344047] transition hover:border-black/20 hover:bg-[#f7f9f8] focus:outline-none focus-visible:ring-4 focus-visible:ring-[#BAF16D]/45 disabled:cursor-wait disabled:opacity-60"
          >
            {loggingOut ? (
              <ButtonSpinner />
            ) : (
              "Sign out"
            )}
          </button>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-5 py-8 sm:px-8 sm:py-12">
        <div className="grid gap-7 lg:grid-cols-[1fr_320px]">
          <section className="rounded-[28px] border border-black/[0.07] bg-white p-6 shadow-[0_18px_60px_rgba(8,16,20,0.06)] sm:p-9">
            <div className="inline-flex items-center gap-2 rounded-full bg-[#edf8dd] px-3 py-1.5 text-xs font-bold text-[#4f6c29]">
              <span className="size-1.5 rounded-full bg-[#7bab39]" />
              Workspace ready
            </div>

            <h1 className="mt-6 max-w-2xl text-3xl font-semibold tracking-[-0.03em] sm:text-4xl">
              Welcome, {state.user.displayName}.
            </h1>
            <p className="mt-4 max-w-2xl text-sm leading-6 text-[#68757b] sm:text-base">
              Your secure account is active. The next product step
              will guide you through business profile and catalogue
              setup.
            </p>

            {selected ? (
              <div className="mt-8 rounded-2xl border border-[#dfe6e2] bg-[#f8faf9] p-5">
                <p className="text-xs font-black tracking-[0.14em] text-[#789c45]">
                  ACTIVE BUSINESS
                </p>
                <div className="mt-2 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <h2 className="text-xl font-semibold">
                      {selected.name}
                    </h2>
                    <p className="mt-1 text-sm capitalize text-[#748087]">
                      {selected.role} access
                    </p>
                  </div>
                  <div className="mt-3 text-xs text-[#879298] sm:mt-0">
                    {state.user.email}
                  </div>
                </div>
              </div>
            ) : (
              <div className="mt-8 rounded-2xl border border-[#f0d6ae] bg-[#fffaf1] p-5 text-sm leading-6 text-[#795727]">
                No active business workspace is available for this
                account yet.
              </div>
            )}

            {error && (
              <div
                role="alert"
                className="mt-5 rounded-xl border border-[#efc7c1] bg-[#fff6f4] px-4 py-3 text-sm text-[#8a2f25]"
              >
                {error}
              </div>
            )}
          </section>

          <aside className="rounded-[28px] bg-[#0b1519] p-6 text-white sm:p-7">
            <p className="text-xs font-black tracking-[0.14em] text-[#BAF16D]">
              BUSINESS ACCESS
            </p>
            <h2 className="mt-3 text-xl font-semibold">
              {state.organizations.length > 1
                ? "Choose workspace"
                : "Your workspace"}
            </h2>
            <p className="mt-2 text-sm leading-6 text-white/55">
              Only businesses you actively belong to are shown here.
            </p>

            {state.organizations.length > 1 && (
              <label className="mt-6 block">
                <span className="mb-2 block text-xs font-semibold text-white/70">
                  Business
                </span>
                <select
                  value={selectedId}
                  onChange={(event) =>
                    setSelectedId(
                      event.target.value,
                    )
                  }
                  className="h-11 w-full rounded-xl border border-white/10 bg-white/10 px-3 text-sm text-white outline-none focus:border-[#BAF16D]/70"
                >
                  {state.organizations.map(
                    (organization) => (
                      <option
                        key={organization.id}
                        value={organization.id}
                        className="text-[#081014]"
                      >
                        {organization.name}
                      </option>
                    ),
                  )}
                </select>
              </label>
            )}

            <div className="mt-7 border-t border-white/10 pt-6">
              <div className="text-xs text-white/40">
                Signed in as
              </div>
              <div className="mt-1 break-all text-sm font-medium text-white/80">
                {state.user.email}
              </div>
            </div>
          </aside>
        </div>
      </div>
    </main>
  );
}

export function App() {
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

        setAuthenticated({
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
    return (
      <Workspace
        state={authenticated}
        onLogout={logout}
      />
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
