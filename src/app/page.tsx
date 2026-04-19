import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { LandingHero } from "@/components/LandingHero";

export default async function HomePage() {
  const session = await auth();
  if (session?.user) redirect("/calendar");

  return <LandingHero />;
}
