import { redirect } from "next/navigation";

export default function ClosingPage() {
  redirect("/quality?tab=acceptance");
}
