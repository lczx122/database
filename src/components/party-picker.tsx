"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Select } from "@/components/ui";

export interface PartyOption {
  id: string;
  code: string;
  name: string;
}

/**
 * Select that writes its value into a search param and reloads the page so the
 * server can re-render dependent data (e.g. a party's open documents). Also
 * submits the value with the surrounding form via `name`.
 */
export function PartyPicker({
  name,
  paramName,
  options,
  value,
  placeholder,
}: {
  name: string;
  paramName: string;
  options: PartyOption[];
  value: string;
  placeholder: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  return (
    <Select
      name={name}
      value={value}
      required
      onChange={(e) => {
        const params = new URLSearchParams(searchParams);
        if (e.target.value) params.set(paramName, e.target.value);
        else params.delete(paramName);
        params.delete("error");
        router.replace(`${pathname}?${params.toString()}`);
      }}
    >
      <option value="">{placeholder}</option>
      {options.map((o) => (
        <option key={o.id} value={o.id}>
          {o.code} — {o.name}
        </option>
      ))}
    </Select>
  );
}
