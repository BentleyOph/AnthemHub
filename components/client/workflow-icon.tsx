import Image from "next/image";
import { IconPlayerPlay } from "@tabler/icons-react";

import { cn } from "@/lib/utils";

interface WorkflowIconProps {
  iconUrl: string | null;
  name: string;
  size?: "sm" | "md" | "lg";
}

export function WorkflowIcon({ iconUrl, name, size = "md" }: WorkflowIconProps) {
  const dimension = size === "sm" ? "size-10" : size === "lg" ? "size-20" : "size-12";

  if (iconUrl && iconUrl.length > 0) {
    const pixels = size === "sm" ? 40 : size === "lg" ? 80 : 48;

    return (
      <span className={cn("shrink-0 overflow-hidden rounded-lg border", dimension)}>
        <Image
          src={iconUrl}
          alt={`${name} icon`}
          width={pixels}
          height={pixels}
          className="size-full object-cover"
          unoptimized
        />
      </span>
    );
  }

  return (
    <span
      className={cn(
        "bg-accent text-accent-foreground flex shrink-0 items-center justify-center rounded-lg border border-border/60",
        dimension,
      )}
      aria-hidden
    >
      <IconPlayerPlay className={size === "lg" ? "size-7" : "size-5"} />
    </span>
  );
}
