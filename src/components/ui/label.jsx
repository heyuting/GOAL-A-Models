import { cva } from "class-variance-authority";

// Define variants and sizes for the label component
const labelVariants = cva("block text-sm font-medium", {
  variants: {
    variant: {
      default: "text-gray-700",          // Default label color
      error: "text-red-600",             // Error state label color
    },
    size: {
      sm: "text-xs",                    // Small text size
      md: "text-sm",                    // Medium text size
      lg: "text-lg",                    // Large text size
    },
  },
  defaultVariants: {
    variant: "default",
    size: "md",
  },
});

// Named export for the Label component
export function Label({ className, variant, size, children, htmlFor, ...props }) {
  return (
    <label
      htmlFor={htmlFor}
      className={`${labelVariants({ variant, size })} ${className}`}
      {...props}
    >
      {children}
    </label>
  );
}
