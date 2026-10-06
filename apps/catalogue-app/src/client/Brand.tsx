// Techabanca master brand.
// This mirrors the company-site geometry and wordmark.
// Product UI work must not redesign or replace this mark.
export function Brand({
  variant = "light",
  href = "https://techabanca.com",
  label = "Techabanca website",
}: {
  variant?: "light" | "dark";
  href?: string;
  label?: string;
}) {
  return (
    <a
      href={href}
      target={href.startsWith("https:") ? "_blank" : undefined}
      rel="noreferrer"
      aria-label={label}
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
