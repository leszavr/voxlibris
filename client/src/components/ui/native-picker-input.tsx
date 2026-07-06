import * as React from "react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type NativePickerInputProps = Omit<React.ComponentProps<typeof Input>, "type"> & {
  type: "date" | "time";
};

const NativePickerInput = React.forwardRef<HTMLInputElement, NativePickerInputProps>(
  ({ type, className, ...props }, ref) => (
    <Input ref={ref} type={type} className={cn("native-picker-input", className)} {...props} />
  ),
);
NativePickerInput.displayName = "NativePickerInput";

export { NativePickerInput };
