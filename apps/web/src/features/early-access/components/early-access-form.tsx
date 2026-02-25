import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@valet/ui/components/button";
import { Input } from "@valet/ui/components/input";
import { Loader2, CheckCircle } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api-client";

const earlyAccessFormSchema = z.object({
  name: z.string().min(1, "Name is required").max(255),
  email: z.string().email("Please enter a valid email address"),
});

type EarlyAccessFormValues = z.infer<typeof earlyAccessFormSchema>;

export function EarlyAccessForm() {
  const [submitted, setSubmitted] = useState(false);
  const [position, setPosition] = useState<number | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<EarlyAccessFormValues>({
    // @ts-expect-error -- ts-rest deep type inference causes TS2589
    resolver: zodResolver(earlyAccessFormSchema),
  });

  const mutation = api.earlyAccess.submit.useMutation({
    onSuccess: (res) => {
      if (res.status === 201) {
        setSubmitted(true);
        if (res.body.position) {
          setPosition(res.body.position);
        }
      } else if (res.status === 409) {
        toast.error("You're already on the waitlist!");
        setSubmitted(true);
      } else {
        toast.error("Something went wrong. Please try again.");
      }
    },
    onError: () => {
      toast.error("Something went wrong. Please try again.");
    },
  });

  function onSubmit(data: EarlyAccessFormValues) {
    mutation.mutate({
      body: data,
    });
  }

  if (submitted) {
    return (
      <div className="flex flex-col items-center gap-2 py-2">
        <CheckCircle className="h-8 w-8 text-green-500" />
        <p className="text-lg font-semibold text-[var(--wk-text-primary)]">You're on the list!</p>
        {position && (
          <p className="text-sm text-[var(--wk-text-secondary)]">You're #{position} in line.</p>
        )}
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="w-full">
      <div className="flex flex-col gap-3 sm:flex-row sm:gap-2">
        <div className="flex-1">
          <Input placeholder="Your name" {...register("name")} aria-invalid={!!errors.name} />
          {errors.name && <p className="mt-1 text-xs text-red-500">{errors.name.message}</p>}
        </div>
        <div className="flex-1">
          <Input
            type="email"
            placeholder="you@example.com"
            {...register("email")}
            aria-invalid={!!errors.email}
          />
          {errors.email && <p className="mt-1 text-xs text-red-500">{errors.email.message}</p>}
        </div>
        <Button type="submit" variant="cta" size="lg" disabled={mutation.isPending}>
          {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Join Waitlist"}
        </Button>
      </div>
    </form>
  );
}
