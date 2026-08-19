import { redirect } from "next/navigation";
import { getCurrentUser, getMemberships } from "@/server/context";

export default async function Home() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const memberships = await getMemberships(user.id);
  redirect(memberships.length ? "/dashboard" : "/onboarding");
}
