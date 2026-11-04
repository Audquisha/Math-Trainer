import { useId } from 'react'

const controlClass = (invalid) =>
  `w-full rounded border bg-bg px-2 py-1 text-heading ${invalid ? 'border-danger' : 'border-border'}`

function Field({ id, label, error, children }) {
  return (
    <div className="flex flex-col gap-1 text-left">
      <label htmlFor={id} className="text-sm text-heading">{label}</label>
      {children}
      {error && <p id={`${id}-error`} className="text-sm text-danger">{error}</p>}
    </div>
  )
}

export function TextField({ label, error, invalid = Boolean(error), ...inputProps }) {
  const id = useId()
  return (
    <Field id={id} label={label} error={error}>
      <input
        id={id}
        aria-invalid={invalid}
        aria-describedby={error ? `${id}-error` : undefined}
        className={controlClass(invalid)}
        {...inputProps}
      />
    </Field>
  )
}

export function SelectField({ label, error, options, placeholder, ...selectProps }) {
  const id = useId()
  return (
    <Field id={id} label={label} error={error}>
      <select
        id={id}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-error` : undefined}
        className={controlClass(Boolean(error))}
        {...selectProps}
      >
        <option value="" disabled>{placeholder}</option>
        {options.map(({ value, label: optionLabel }) => (
          <option key={value} value={value}>{optionLabel}</option>
        ))}
      </select>
    </Field>
  )
}
