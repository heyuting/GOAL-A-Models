import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva } from "class-variance-authority";

// Define variants for the input styles
const inputVariants = cva(
  "block w-full rounded-md border px-3 py-2 text-sm focus:outline-none", // removed bg-transparent
  {
    variants: {
      variant: {
        default: "border-gray-300 focus:ring-2 focus:ring-blue-500 bg-transparent",
        outline: "border-gray-300 focus:ring-2 focus:ring-blue-500 bg-transparent",
        error: "border-red-500 focus:ring-2 focus:ring-red-500 bg-transparent",
      },
      size: {
        sm: "text-sm p-2",
        md: "text-base p-3",
        lg: "text-lg p-4",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "md",
    },
  }
);


const Input = React.forwardRef(({ className, variant, size, asChild, ...props }, ref) => {
  const Comp = asChild ? Slot : "input";

  return (
    <Comp
      {...props}
      ref={ref}
      className={inputVariants({ variant, size, className })}
    />
  );
});

Input.displayName = "Input";

export { Input };
