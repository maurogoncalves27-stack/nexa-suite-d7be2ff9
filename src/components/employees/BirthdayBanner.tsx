import { PartyPopper, Cake } from "lucide-react";

interface BirthdayBannerProps {
  birthDate: string | null;
  fullName: string;
}

/**
 * Shows a slim, festive banner only on the employee's birthday.
 * Compares MM-DD against today (timezone-safe by parsing the YYYY-MM-DD string).
 */
export default function BirthdayBanner({ birthDate, fullName }: BirthdayBannerProps) {
  if (!birthDate) return null;

  const today = new Date();
  const todayMonth = today.getMonth() + 1;
  const todayDay = today.getDate();

  const month = parseInt(birthDate.slice(5, 7), 10);
  const day = parseInt(birthDate.slice(8, 10), 10);

  if (month !== todayMonth || day !== todayDay) return null;

  const firstName = fullName.split(" ")[0];

  return (
    <div className="relative overflow-hidden rounded-lg border border-primary/30 bg-gradient-to-r from-primary/15 via-accent/15 to-primary/15 px-4 py-2.5 shadow-sm">
      <div className="flex items-center gap-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/20 text-primary">
          <Cake className="h-4 w-4" />
        </div>
        <p className="flex-1 text-sm font-medium text-foreground">
          🎉 Feliz aniversário, <span className="font-semibold">{firstName}</span>! Toda a equipe deseja um dia especial!
        </p>
        <PartyPopper className="hidden h-5 w-5 text-primary sm:block animate-pulse" />
      </div>
    </div>
  );
}
