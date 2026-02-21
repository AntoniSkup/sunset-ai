"use client";

import { Button } from "@/components/ui/button";
import {
  ArrowRightIcon,
  ArrowPathIcon,
} from "@heroicons/react/24/outline";
import { useFormStatus } from "react-dom";

export function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <Button
      type="submit"
      disabled={pending}
      variant="outline"
      className="w-full rounded-full"
    >
      {pending ? (
        <>
          <ArrowPathIcon className="animate-spin mr-2 h-4 w-4" />
          Loading...
        </>
      ) : (
        <>
          Get Started
          <ArrowRightIcon className="ml-2 h-4 w-4" />
        </>
      )}
    </Button>
  );
}
