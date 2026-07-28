import { redirect } from "next/navigation";
import { athleteLogOut } from "@/lib/session";

export async function POST() {
  await athleteLogOut();
  redirect("/");
}
