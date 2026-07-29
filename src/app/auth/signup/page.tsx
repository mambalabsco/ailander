import { AuthForm } from "@/app/auth/auth-form";
import { signUp } from "@/app/auth/actions";

export const metadata = { title: "Crear cuenta | Lumen Lab IA" };

export default function SignupPage() {
  return <AuthForm mode="signup" action={signUp} />;
}
