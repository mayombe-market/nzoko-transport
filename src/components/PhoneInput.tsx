"use client";

import { useEffect, useId, useState } from "react";
import { formatLocal, localDigits, normalizePhone, phoneError } from "@/lib/phone";

interface Props {
  /** Valeur stockée (+242061234567) ou ancien format ; "" si vide */
  value: string;
  /** Renvoie le format normalisé (+242…) si valide, sinon la saisie brute, et la validité */
  onChange: (value: string, valid: boolean) => void;
  label?: string;
  required?: boolean;
  id?: string;
  className?: string;
  disabled?: boolean;
  placeholder?: string;
}

/**
 * Champ téléphone congolais commun : « +242 | 06 123 45 67 ».
 * Indicatif fixe, formatage pendant la saisie, collage de n'importe quel format,
 * message d'erreur discret uniquement après le début de la saisie.
 */
export function PhoneInput({ value, onChange, label, required, id, className = "", disabled, placeholder = "06 123 45 67" }: Props) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const [text, setText] = useState(() => formatLocal(localDigits(value)));

  // Suit les changements de valeur venant du parent (réinitialisation, chargement…)
  useEffect(() => {
    const incoming = formatLocal(localDigits(value));
    if (localDigits(incoming) !== localDigits(text)) setText(incoming);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const error = phoneError(text);

  function update(raw: string) {
    const digits = localDigits(raw);
    const formatted = formatLocal(digits);
    setText(formatted);
    const normalized = normalizePhone(digits);
    onChange(normalized ?? digits, normalized !== null);
  }

  return (
    <div className={className}>
      {label && (
        <label htmlFor={inputId} className="block text-sm font-medium text-gray-700 mb-1">
          {label}
          {required ? " *" : ""}
        </label>
      )}
      <div
        className={`flex items-stretch rounded-lg border-2 bg-gray-50 focus-within:bg-white transition-colors ${
          error ? "border-red-300 focus-within:border-red-400" : "border-gray-200 focus-within:border-accent-500"
        } ${disabled ? "opacity-60" : ""}`}
      >
        <span className="flex items-center px-3 text-base font-semibold text-night border-r-2 border-gray-200 select-none">+242</span>
        <input
          id={inputId}
          type="tel"
          inputMode="numeric"
          autoComplete="tel-national"
          value={text}
          disabled={disabled}
          required={required}
          placeholder={placeholder}
          onChange={(e) => update(e.target.value)}
          onPaste={(e) => {
            e.preventDefault();
            update(e.clipboardData.getData("text"));
          }}
          className="flex-1 min-w-0 bg-transparent px-3 py-3 text-base font-medium text-gray-900 tracking-wide focus:outline-none placeholder:text-gray-400"
          aria-invalid={!!error}
          aria-describedby={error ? `${inputId}-err` : undefined}
        />
      </div>
      {error && (
        <p id={`${inputId}-err`} className="mt-1 text-xs text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}
