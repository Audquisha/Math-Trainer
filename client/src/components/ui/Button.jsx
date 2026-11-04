export default function Button({ type = 'button', className = '', ...props }) {
  return (
    <button
      type={type}
      className={`cursor-pointer rounded border border-border px-4 py-1.5 text-heading hover:border-accent disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
      {...props}
    />
  )
}
