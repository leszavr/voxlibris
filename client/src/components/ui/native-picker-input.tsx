import * as React from "react";

import { Input } from "@/components/ui/input";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

type NativePickerInputProps = Omit<React.ComponentProps<typeof Input>, "type"> & {
  type: "date" | "time";
};

const NativePickerInput = React.forwardRef<HTMLInputElement, NativePickerInputProps>(
  ({ type, className, onClick, onKeyDown, ...props }, ref) => {
    const inputRef = React.useRef<HTMLInputElement>(null);
    const [fallbackOpen, setFallbackOpen] = React.useState(false);
    const [draftTime, setDraftTime] = React.useState("00:00");

    React.useImperativeHandle(ref, () => inputRef.current as HTMLInputElement);

    const openNativePicker = React.useCallback(() => {
      const input = inputRef.current as (HTMLInputElement & { showPicker?: () => void }) | null;
      if (!input || typeof input.showPicker !== "function") return false;

      try {
        input.showPicker();
        return true;
      } catch {
        return false;
      }
    }, []);

    const openPicker = React.useCallback(() => {
      if (openNativePicker()) return;
      if (type === "time") {
        setDraftTime(normalizeTime(inputRef.current?.value));
        setFallbackOpen(true);
      }
    }, [openNativePicker, type]);

    const commitTime = React.useCallback((nextTime: string) => {
      const input = inputRef.current;
      if (!input) return;

      const valueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
      valueSetter?.call(input, nextTime);
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
      setDraftTime(nextTime);
    }, []);

    return (
      <Popover open={fallbackOpen} onOpenChange={setFallbackOpen}>
        <PopoverAnchor asChild>
          <Input
            ref={inputRef}
            type={type}
            className={cn("native-picker-input", className)}
            onClick={(event) => {
              onClick?.(event);
              if (!event.defaultPrevented) openPicker();
            }}
            onKeyDown={(event) => {
              onKeyDown?.(event);
              if (!event.defaultPrevented && (event.key === "Enter" || event.key === " ")) openPicker();
            }}
            {...props}
          />
        </PopoverAnchor>

        {type === "time" ? (
          <PopoverContent align="start" className="w-auto p-3" onOpenAutoFocus={(event) => event.preventDefault()}>
            <div className="flex items-end gap-2">
              <TimeSelect
                label="Часы"
                value={draftTime.slice(0, 2)}
                options={HOURS}
                onChange={(hour) => commitTime(`${hour}:${draftTime.slice(3, 5)}`)}
              />
              <span className="pb-2 text-muted-foreground">:</span>
              <TimeSelect
                label="Минуты"
                value={draftTime.slice(3, 5)}
                options={MINUTES}
                onChange={(minute) => commitTime(`${draftTime.slice(0, 2)}:${minute}`)}
              />
            </div>
          </PopoverContent>
        ) : null}
      </Popover>
    );
  },
);
NativePickerInput.displayName = "NativePickerInput";

const HOURS = Array.from({ length: 24 }, (_, hour) => hour.toString().padStart(2, "0"));
const MINUTES = Array.from({ length: 60 }, (_, minute) => minute.toString().padStart(2, "0"));

function normalizeTime(value: string | undefined) {
  return /^\d{2}:\d{2}$/.test(value ?? "") ? value as string : "00:00";
}

function TimeSelect({ label, value, options, onChange }: Readonly<{
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
}>) {
  return (
    <label className="grid gap-1 text-xs text-muted-foreground">
      {label}
      <select
        className="h-9 rounded-md border border-input bg-background px-2 text-sm text-foreground"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {options.map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
    </label>
  );
}

export { NativePickerInput };
