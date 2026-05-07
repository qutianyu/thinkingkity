import { FormEvent, ReactNode, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { readLoginStatus, verifyLogin } from "@/lib/globalVaults";
import { clearAuthTokens, getAuthToken, setAuthToken } from "@/lib/authSession";

interface LoginGateProps {
  children: ReactNode;
}

export function LoginGate({ children }: LoginGateProps) {
  const { t } = useTranslation();
  const [checking, setChecking] = useState(true);
  const [authEnabled, setAuthEnabled] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    const handleLogout = () => {
      clearAuthTokens();
      setAuthenticated(false);
    };
    window.addEventListener("thinkingkity-auth-logout", handleLogout);

    readLoginStatus()
      .then((status) => {
        if (cancelled) return;
        setAuthEnabled(status.enabled);
        setAuthenticated(!status.enabled || Boolean(getAuthToken()));
      })
      .catch(() => {
        if (cancelled) return;
        setAuthEnabled(false);
        setAuthenticated(true);
      })
      .finally(() => {
        if (!cancelled) setChecking(false);
      });

    return () => {
      cancelled = true;
      window.removeEventListener("thinkingkity-auth-logout", handleLogout);
    };
  }, []);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (submitting) return;

    setSubmitting(true);
    setError("");
    try {
      const result = await verifyLogin(username, password);
      if (!result.ok) {
        setError(t("login.invalidCredentials"));
        return;
      }
      if (result.token) setAuthToken(result.token, username);
      setAuthenticated(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("login.failed"));
    } finally {
      setSubmitting(false);
    }
  };

  if (checking) {
    return (
      <div className="login-shell">
        <Loader2 className="login-spinner" size={22} />
      </div>
    );
  }

  if (!authEnabled || authenticated) {
    return <>{children}</>;
  }

  return (
    <div className="login-shell">
      <form className="login-card" onSubmit={submit}>
        <div className="login-brand">
          <div className="login-logo">
            <img src="/logo.png" alt="ThinkingKity" />
          </div>
          <h1>{t("app.name")}</h1>
        </div>
        <div className="login-copy">
          <h2>{t("login.title")}</h2>
          <p>{t("login.description")}</p>
        </div>
        <label className="login-field">
          <span>{t("login.username")}</span>
          <input
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            autoFocus
            autoComplete="username"
            aria-label={t("login.username")}
          />
        </label>
        <label className="login-field">
          <span>{t("login.password")}</span>
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
            aria-label={t("login.password")}
          />
        </label>
        {error && <div className="login-error">{error}</div>}
        <button className="btn-primary login-submit" disabled={submitting}>
          {submitting && <Loader2 className="login-spinner" size={16} />}
          {t("login.submit")}
        </button>
      </form>
    </div>
  );
}
