import { AuthForm } from "@/app/auth/auth-form";
import { signIn } from "@/app/auth/actions";

export const metadata = { title: "Entrar | Lumen Lab IA" };

interface LoginPageProps {
  searchParams: Promise<{ next?: string; registrado?: string }>;
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const { next, registrado } = await searchParams;

  return (
    <AuthForm
      mode="login"
      action={signIn}
      next={next}
      notice={
        registrado
          ? "Cuenta creada. Si tu proyecto pide confirmar el correo, revisa la bandeja antes de entrar."
          : null
      }
    />
  );
}
