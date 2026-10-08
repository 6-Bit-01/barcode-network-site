import { permanentRedirect } from "next/navigation";

export default function SystemOverrideRedirect() {
  permanentRedirect("/secret-menu");
}
