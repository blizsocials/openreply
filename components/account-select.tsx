"use client";

import { useI18n } from "@/lib/i18n/provider";
import { useEffect } from "react";
import { onClientChange, readClient, writeClient } from "@/lib/client-selection";


export interface AccountOption {
  id: string;
  username: string;
  instagramId: string;
  name?: string | null;
}

interface AccountSelectProps {
  accounts: AccountOption[];
  value: string;
  onChange: (value: string) => void;
  includeAll?: boolean;
  label?: string;
}

export default function AccountSelect({
  accounts,
  value,
  onChange,
  includeAll = true,
  label,
}: AccountSelectProps) {
  const { t } = useI18n();

  // Follow the sidebar client switcher: adopt the saved client when this page
  // loads, and keep following it while the page is open.
  useEffect(() => {
    const saved = readClient();
    if (saved && saved !== value && (saved === "all" ? includeAll : accounts.some((a) => a.id === saved))) {
      onChange(saved);
    }
    return onClientChange((id) => {
      if (id === "all" ? includeAll : accounts.some((a) => a.id === id)) onChange(id);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accounts.length]);

  return (
    <label className="flex flex-col gap-2 text-sm">
      <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
        {label ?? t("Instagram account")}
      </span>
      <select
        value={value}
        onChange={(event) => {
          onChange(event.target.value);
          writeClient(event.target.value);
        }}
        className="min-w-52 rounded-xl border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none transition-colors focus:border-accent/40"
      >
        {includeAll && <option value="all">{t("All accounts")}</option>}
        {accounts.map((account) => (
          <option key={account.id} value={account.id}>
            @{account.username}
          </option>
        ))}
      </select>
    </label>
  );
}

