/** Returns { field: message } for every field in `labels` whose value is blank. */
export function requiredFieldErrors(values, labels) {
  const errors = {}
  for (const [field, label] of Object.entries(labels)) {
    if (!values[field]?.trim()) errors[field] = `${label} is required!`
  }
  return errors
}

export const hasErrors = (errors) => Object.keys(errors).length > 0
